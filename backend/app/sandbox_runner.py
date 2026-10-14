"""Sandboxed child process that runs one strategy.

Started by ``sandbox.run_strategy_sandboxed`` as ``python -I sandbox_runner.py``.
Reads a JSON job from stdin and writes one JSON result to stdout. It never
touches the network or filesystem: market data arrives on stdin.

Job:    {"code": str, "bars": [{date, open, high, low, close, volume}, ...],
         "lookahead_check": bool}
Result: {"ok": true, "buy": [bool], "sell": [bool], "logs": [str],
         "warnings": [str], "lookahead": {...}}
     or {"ok": false, "error": str, "logs": [str]}
"""

from __future__ import annotations

import io
import json
import os
import sys
import traceback

CPU_SECONDS = int(os.environ.get("SANDBOX_CPU_SECONDS", "15"))
MEMORY_BYTES = int(os.environ.get("SANDBOX_MEMORY_MB", "1536")) * 1024 * 1024
MAX_LOG_LINES = 200
NOBODY_UID = 65534


def _apply_limits() -> None:
    try:
        import resource
    except ImportError:  # non-POSIX dev machines: rely on the parent timeout
        return
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))  # cannot write files
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if hasattr(os, "getuid") and os.getuid() == 0:
        os.setgroups([])
        os.setgid(NOBODY_UID)
        os.setuid(NOBODY_UID)


class _LogCapture(io.StringIO):
    def lines(self) -> list[str]:
        return self.getvalue().splitlines()[:MAX_LOG_LINES]


def _restricted_globals(np, pd, math):
    allowed_modules = {"pandas": pd, "numpy": np, "math": math}

    def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        if level != 0 or name not in allowed_modules:
            raise ImportError(f"import of '{name}' is not allowed")
        return allowed_modules[name]

    import builtins as _b

    safe_names = [
        "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter", "float",
        "int", "isinstance", "len", "list", "map", "max", "min", "pow", "range",
        "reversed", "round", "set", "slice", "sorted", "str", "sum", "tuple", "zip",
        "print", "frozenset", "Exception", "ValueError", "KeyError", "IndexError",
        "TypeError", "ZeroDivisionError", "ArithmeticError", "RuntimeError",
        "True", "False", "None",
    ]
    safe_builtins = {n: getattr(_b, n) for n in safe_names if hasattr(_b, n)}
    safe_builtins["__import__"] = safe_import
    return {"__builtins__": safe_builtins, "__name__": "strategy", "pd": pd, "np": np, "math": math}


def _signals(run_strategy, df, pd):
    out = run_strategy(df.copy())
    if not isinstance(out, pd.DataFrame):
        raise TypeError("run_strategy(df) must return the DataFrame")
    for col in ("Buy", "Sell"):
        if col not in out.columns:
            raise ValueError(f"run_strategy(df) must add a boolean '{col}' column")
    warnings = []
    if len(out.index) != len(df.index) or not out.index.equals(df.index):
        warnings.append("strategy changed the DataFrame rows (e.g. dropna); missing rows treated as no signal")
        out = out.reindex(df.index)
    buy = out["Buy"].fillna(False).astype(bool).tolist()
    sell = out["Sell"].fillna(False).astype(bool).tolist()
    return buy, sell, warnings


def _lookahead_check(run_strategy, df, full_buy, full_sell, pd):
    """Re-run on shorter histories: a causal strategy must reproduce the same
    signals on every bar it can see. Differences mean it used future data."""
    n = len(df)
    mismatches = 0
    first_date = None
    for frac in (0.6, 0.85):
        cut = int(n * frac)
        if cut < 30:
            continue
        buy, sell, _ = _signals(run_strategy, df.iloc[:cut], pd)
        for i in range(cut):
            if buy[i] != full_buy[i] or sell[i] != full_sell[i]:
                mismatches += 1
                if first_date is None or str(df.index[i].date()) < first_date:
                    first_date = str(df.index[i].date())
    return {"checked": True, "uses_future_data": mismatches > 0,
            "mismatched_bars": mismatches, "first_mismatch_date": first_date}


def main() -> None:
    real_stdout = sys.stdout
    job = json.loads(sys.stdin.read())

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from validator import validate_strategy_code  # trusted, our own module

    import math
    import numpy as np
    import pandas as pd

    _apply_limits()

    logs = _LogCapture()
    result: dict
    try:
        check = validate_strategy_code(job["code"])
        if not check.ok:
            raise ValueError("strategy rejected: " + "; ".join(check.errors))

        bars = job["bars"]
        df = pd.DataFrame({
            "Open": [b["open"] for b in bars],
            "High": [b["high"] for b in bars],
            "Low": [b["low"] for b in bars],
            "Close": [b["close"] for b in bars],
            "Volume": [b["volume"] for b in bars],
        }, index=pd.DatetimeIndex([b["date"] for b in bars], name="Date"), dtype="float64")

        env = _restricted_globals(np, pd, math)
        sys.stdout = logs
        exec(compile(job["code"], "<strategy>", "exec"), env)  # noqa: S102 - sandboxed
        run_strategy = env.get("run_strategy")
        if not callable(run_strategy):
            raise ValueError("code must define run_strategy(df)")

        buy, sell, warnings = _signals(run_strategy, df, pd)
        lookahead = {"checked": False}
        if job.get("lookahead_check", True):
            lookahead = _lookahead_check(run_strategy, df, buy, sell, pd)
        sys.stdout = real_stdout
        result = {"ok": True, "buy": buy, "sell": sell, "logs": logs.lines(),
                  "warnings": check.warnings + warnings, "lookahead": lookahead}
    except BaseException as exc:  # noqa: BLE001 - report every failure to the parent
        sys.stdout = real_stdout
        tb = traceback.extract_tb(exc.__traceback__)
        user_frames = [f for f in tb if f.filename == "<strategy>"]
        where = f" (strategy line {user_frames[-1].lineno})" if user_frames else ""
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}{where}", "logs": logs.lines()}

    real_stdout.write(json.dumps(result))
    real_stdout.flush()


if __name__ == "__main__":
    main()
