"""AlgoLearn strategy engine.

Runs user / AI generated ``run_strategy(df)`` Python code against market
data supplied by the Next.js app and returns the Buy / Sell signal arrays.
Portfolio accounting stays in the Next.js app (``lib/portfolio.ts``) so every
backtest, whatever produced its signals, is scored by the same code.

The engine needs no internet access: data arrives in the request body.
"""

from __future__ import annotations

import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from .sandbox import SandboxError, run_strategy_sandboxed
from .validator import validate_strategy_code

ENGINE_API_KEY = os.environ.get("ENGINE_API_KEY", "")
MAX_BARS = 5000

app = FastAPI(title="AlgoLearn Strategy Engine", version="1.0.0")


def require_key(x_engine_key: str = Header(default="")) -> None:
    if ENGINE_API_KEY and not hmac.compare_digest(x_engine_key, ENGINE_API_KEY):
        raise HTTPException(status_code=401, detail="invalid engine key")


class Bar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class CodeIn(BaseModel):
    code: str = Field(max_length=20_000)


class SignalsIn(CodeIn):
    bars: list[Bar]
    lookahead_check: bool = True

    @field_validator("bars")
    @classmethod
    def _bars_ok(cls, v: list[Bar]) -> list[Bar]:
        if len(v) < 10:
            raise ValueError("at least 10 bars are required")
        if len(v) > MAX_BARS:
            raise ValueError(f"at most {MAX_BARS} bars are allowed")
        return v


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "python-sandbox", "version": app.version}


@app.post("/validate", dependencies=[Depends(require_key)])
def validate(body: CodeIn) -> dict:
    r = validate_strategy_code(body.code)
    return {"ok": r.ok, "errors": r.errors, "warnings": r.warnings}


@app.post("/signals", dependencies=[Depends(require_key)])
def signals(body: SignalsIn) -> dict:
    check = validate_strategy_code(body.code)
    if not check.ok:
        raise HTTPException(status_code=422, detail={"message": "strategy rejected", "errors": check.errors})
    try:
        result = run_strategy_sandboxed(body.code, [b.model_dump() for b in body.bars], body.lookahead_check)
    except SandboxError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "errors": [str(exc)]}) from exc
    if not result.get("ok"):
        raise HTTPException(
            status_code=422,
            detail={"message": result.get("error", "strategy failed"), "errors": [result.get("error")],
                    "logs": result.get("logs", [])},
        )
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
