import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sandbox import run_strategy_sandboxed
from app.validator import validate_strategy_code

client = TestClient(app)


def make_bars(n=200):
    bars = []
    price = 100.0
    for i in range(n):
        price *= 1 + 0.02 * math.sin(i / 7)
        bars.append({"date": f"2024-{1 + i // 28:02d}-{1 + i % 28:02d}", "open": price, "high": price * 1.01,
                     "low": price * 0.99, "close": price, "volume": 1000 + i})
    return bars[: min(n, 12 * 28)]


SMA_CROSS = """
import pandas as pd

def run_strategy(df):
    df = df.copy()
    fast = df['Close'].rolling(5).mean()
    slow = df['Close'].rolling(20).mean()
    df['Buy'] = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    df['Sell'] = (fast < slow) & (fast.shift(1) >= slow.shift(1))
    print('rows', len(df))
    return df
"""

PEEKING = """
def run_strategy(df):
    df = df.copy()
    df['Buy'] = df['Close'].shift(-1) > df['Close']
    df['Sell'] = df['Close'].shift(-1) < df['Close']
    return df
"""


@pytest.mark.parametrize("code,needle", [
    ("import os\ndef run_strategy(df):\n    return df", "import of 'os'"),
    ("def run_strategy(df):\n    return df.__class__", "private attribute"),
    ("def run_strategy(df):\n    open('/etc/passwd')\n    return df", "'open'"),
    ("import pandas as pd\ndef run_strategy(df):\n    pd.read_csv('http://x')\n    return df", "read_csv"),
    ("def run_strategy(df):\n    df.to_csv('/tmp/x')\n    return df", "to_csv"),
    ("def run_strategy(df):\n    return df.eval('1')", "'.eval'"),
    ("def run_strategy(df):\n    return '{0.__class__}'.format(df)", "'.format'"),
    ("from numpy import lib\ndef run_strategy(df):\n    return df", "lib"),
    ("def f(x):\n    return x", "run_strategy"),
    ("def run_strategy(df)\n    return df", "syntax error"),
])
def test_validator_rejects(code, needle):
    r = validate_strategy_code(code)
    assert not r.ok
    assert any(needle in e for e in r.errors), r.errors


def test_validator_accepts_template_and_warns_on_future():
    assert validate_strategy_code(SMA_CROSS).ok
    r = validate_strategy_code(PEEKING)
    assert r.ok and any("FUTURE" in w for w in r.warnings)


def test_sandbox_runs_real_code():
    bars = make_bars()
    r = run_strategy_sandboxed(SMA_CROSS, bars)
    assert r["ok"], r
    assert len(r["buy"]) == len(bars) and any(r["buy"]) and any(r["sell"])
    assert r["lookahead"]["uses_future_data"] is False
    assert r["logs"] == ["rows 200", "rows 120", "rows 170"]  # full run + two shorter look-ahead re-runs


def test_sandbox_detects_lookahead():
    r = run_strategy_sandboxed(PEEKING, make_bars())
    assert r["ok"], r
    assert r["lookahead"]["uses_future_data"] is True


def test_sandbox_blocks_runtime_import_escape():
    # passes static checks only if the validator were bypassed; the runner re-validates
    code = "def run_strategy(df):\n    m = __import__('os')\n    return df"
    r = run_strategy_sandboxed(code, make_bars())
    assert not r["ok"] and "rejected" in r["error"]


def test_sandbox_reports_user_errors_with_line():
    code = "def run_strategy(df):\n    x = 1\n    return df['Nope']"
    r = run_strategy_sandboxed(code, make_bars())
    assert not r["ok"] and "KeyError" in r["error"] and "line 3" in r["error"]


def test_sandbox_requires_buy_sell_columns():
    r = run_strategy_sandboxed("def run_strategy(df):\n    return df", make_bars())
    assert not r["ok"] and "'Buy'" in r["error"]


def test_sandbox_cpu_limit():
    code = "def run_strategy(df):\n    while True:\n        pass\n    return df"
    with pytest.raises(Exception) as exc:
        run_strategy_sandboxed(code, make_bars())
    assert "limit" in str(exc.value) or "longer" in str(exc.value)


def test_api_signals_and_validate():
    bars = make_bars()
    res = client.post("/signals", json={"code": SMA_CROSS, "bars": bars})
    assert res.status_code == 200, res.text
    assert len(res.json()["buy"]) == len(bars)

    res = client.post("/signals", json={"code": "import socket\ndef run_strategy(df):\n    return df", "bars": bars})
    assert res.status_code == 422
    assert "socket" in res.json()["detail"]["errors"][0]

    res = client.post("/validate", json={"code": SMA_CROSS})
    assert res.json()["ok"] is True
