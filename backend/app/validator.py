"""Static checks for user / AI generated strategy code.

This is the first of three layers protecting the backtest engine:

1. this AST validator rejects code that tries to import anything other than
   pandas / numpy / math, touch dunder attributes, do file or network I/O, or
   call dynamic-execution helpers;
2. ``sandbox_runner`` executes the code in a separate process with restricted
   builtins, an import allow-list, CPU / memory / file-size limits and (when
   started as root) dropped privileges;
3. the deployment runs the engine on an internal-only Docker network, so even
   a full escape has no network egress.

None of the layers is meant to be sufficient on its own.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field

ALLOWED_IMPORTS = {"pandas", "numpy", "math"}

FORBIDDEN_NAMES = {
    "exec", "eval", "compile", "open", "__import__", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "hasattr", "input", "breakpoint", "help",
    "exit", "quit", "dir", "type", "object", "memoryview", "classmethod",
    "staticmethod", "property", "super", "__builtins__", "__loader__", "__spec__",
}

# Attribute names that reach I/O, code evaluation, or module internals.
FORBIDDEN_ATTRS = {
    "eval", "query", "load", "loads", "save", "savez", "savez_compressed",
    "fromfile", "tofile", "loadtxt", "savetxt", "genfromtxt", "memmap", "fromregex",
    "ctypeslib", "lib", "testing", "f2py", "distutils", "io", "os", "sys", "pickle",
    "compat", "core", "util", "api", "plotting", "builtins", "importlib", "subprocess",
    "socket", "shutil", "pathlib", "ctypes", "format", "format_map", "system",
    "popen", "spawn", "mro", "gi_frame", "f_globals", "f_locals", "f_back", "tb_frame",
    "cr_frame", "ag_frame", "func_globals", "show_config", "test",
    "DataSource", "ExcelWriter", "HDFStore", "ExcelFile", "get_include",
}

# ``to_*`` methods are mostly file writers; only these are allowed.
ALLOWED_TO_ATTRS = {
    "to_numpy", "to_list", "to_frame", "to_dict", "to_datetime", "to_numeric",
    "to_timedelta", "to_period", "to_timestamp",
}

MAX_CODE_CHARS = 20_000


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class _Checker(ast.NodeVisitor):
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.has_run_strategy = False

    def _err(self, node: ast.AST, msg: str) -> None:
        line = getattr(node, "lineno", "?")
        self.errors.append(f"line {line}: {msg}")

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            root = alias.name.split(".")[0]
            if root not in ALLOWED_IMPORTS:
                self._err(node, f"import of '{alias.name}' is not allowed (only pandas, numpy, math)")
            elif alias.name != root:
                self._err(node, f"import of submodule '{alias.name}' is not allowed")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        mod = node.module or ""
        if node.level or mod not in ALLOWED_IMPORTS:
            self._err(node, f"'from {mod} import ...' is not allowed (only pandas, numpy, math)")
        for alias in node.names:
            if alias.name == "*" or alias.name.startswith("_") or alias.name in FORBIDDEN_ATTRS:
                self._err(node, f"importing '{alias.name}' from {mod} is not allowed")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in FORBIDDEN_NAMES:
            self._err(node, f"use of '{node.id}' is not allowed")
        if node.id.startswith("__"):
            self._err(node, f"dunder name '{node.id}' is not allowed")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        attr = node.attr
        if attr.startswith("_"):
            self._err(node, f"access to private attribute '.{attr}' is not allowed")
        elif attr in FORBIDDEN_ATTRS:
            self._err(node, f"'.{attr}' is not allowed in strategy code")
        elif attr.startswith("read_"):
            self._err(node, f"'.{attr}' (file / network reading) is not allowed")
        elif attr.startswith("to_") and attr not in ALLOWED_TO_ATTRS:
            self._err(node, f"'.{attr}' (file export) is not allowed")
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._err(node, "class definitions are not allowed; use functions")
        self.generic_visit(node)

    def visit_Global(self, node: ast.Global) -> None:
        self._err(node, "'global' is not allowed")

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self._err(node, "'nonlocal' is not allowed")

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._err(node, "async functions are not allowed")

    def visit_Await(self, node: ast.Await) -> None:
        self._err(node, "'await' is not allowed")

    def visit_Yield(self, node: ast.Yield) -> None:
        self._err(node, "generators are not allowed")

    def visit_YieldFrom(self, node: ast.YieldFrom) -> None:
        self._err(node, "generators are not allowed")

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if node.decorator_list:
            self._err(node, "decorators are not allowed")
        if node.name == "run_strategy":
            self.has_run_strategy = True
            if len(node.args.args) < 1:
                self._err(node, "run_strategy must take the DataFrame as its first argument")
        self.generic_visit(node)


def validate_strategy_code(code: str) -> ValidationResult:
    if not code or not code.strip():
        return ValidationResult(False, ["strategy code is empty"])
    if len(code) > MAX_CODE_CHARS:
        return ValidationResult(False, [f"strategy code is longer than {MAX_CODE_CHARS} characters"])
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        return ValidationResult(False, [f"syntax error on line {exc.lineno}: {exc.msg}"])

    checker = _Checker()
    checker.visit(tree)
    if not checker.has_run_strategy:
        checker.errors.append("code must define a function named run_strategy(df)")

    warnings: list[str] = []
    src = code.replace(" ", "")
    if "shift(-" in src:
        warnings.append(
            "code uses shift(-n), which reads FUTURE prices; the backtest will look unrealistically good"
        )
    if "center=True" in src:
        warnings.append("rolling(center=True) uses future prices")

    return ValidationResult(not checker.errors, checker.errors, warnings)
