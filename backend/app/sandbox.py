"""Parent side of the sandbox: spawns ``sandbox_runner`` in a fresh process."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sandbox_runner.py")
WALL_TIMEOUT = float(os.environ.get("SANDBOX_WALL_SECONDS", "30"))

# The child gets a minimal environment: no secrets, single-threaded math libs.
_CHILD_ENV = {
    "PATH": "/usr/bin:/bin",
    "OPENBLAS_NUM_THREADS": "1",
    "OMP_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "SANDBOX_CPU_SECONDS": os.environ.get("SANDBOX_CPU_SECONDS", "15"),
    "SANDBOX_MEMORY_MB": os.environ.get("SANDBOX_MEMORY_MB", "1536"),
}


class SandboxError(Exception):
    pass


def run_strategy_sandboxed(code: str, bars: list[dict], lookahead_check: bool = True) -> dict:
    job = json.dumps({"code": code, "bars": bars, "lookahead_check": lookahead_check})
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, "-I", RUNNER],
            input=job,
            capture_output=True,
            text=True,
            timeout=WALL_TIMEOUT,
            env=_CHILD_ENV,
            cwd="/",
        )
    except subprocess.TimeoutExpired as exc:
        raise SandboxError(f"strategy took longer than {WALL_TIMEOUT:.0f}s and was stopped") from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if proc.returncode != 0 or not proc.stdout:
        if proc.returncode in (-9, -24, 152, 137):  # SIGKILL / SIGXCPU
            raise SandboxError("strategy exceeded its CPU or memory limit and was stopped")
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        raise SandboxError("strategy process crashed: " + " | ".join(tail))
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SandboxError("strategy process returned malformed output") from exc
    result["runtime_ms"] = elapsed_ms
    return result
