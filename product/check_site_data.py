# -*- coding: utf-8 -*-
"""
Check that the committed dashboard data is what data/raw produces today.

    python product/check_site_data.py

Rebuilds product/site/data.json and data-series.json into a temporary folder and
compares them with the committed files value by value. Numbers may differ by at most
one unit in their last reported digit: the same calculation can round 18.5749999 and
18.5750001 differently on different operating systems. Anything larger, and any
difference in structure or text, fails the check. Differences are printed as GitHub
Actions annotations so they are visible on the pull request.
"""

import json
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_site  # noqa: E402

FILES = ("data.json", "data-series.json")


def last_digit(x: float) -> float:
    """Size of one unit in the last reported digit of x (0.001 for 18.575)."""
    exp = Decimal(repr(x)).as_tuple().exponent
    return 10.0 ** exp if isinstance(exp, int) and exp < 0 else 1.0


def compare(a, b, path, out, tiny):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}.{k}: present in only one file")
            else:
                compare(a[k], b[k], f"{path}.{k}", out, tiny)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: length {len(a)} vs {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, f"{path}[{i}]", out, tiny)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        if a != b:
            tol = max(1.0001 * max(last_digit(float(a)), last_digit(float(b))),
                      1e-12 * max(1.0, abs(a), abs(b)))          # machine-precision noise
            (tiny if abs(a - b) <= tol else out).append(f"{path}: committed {a} vs rebuilt {b}")
    elif a != b:
        out.append(f"{path}: committed {a!r} vs rebuilt {b!r}")


def main() -> int:
    errors, tiny = [], []
    with tempfile.TemporaryDirectory() as tmp:
        build_site.main(Path(tmp))
        for f in FILES:
            committed = json.loads((build_site.SITE / f).read_text(encoding="utf-8"))
            rebuilt = json.loads((Path(tmp) / f).read_text(encoding="utf-8"))
            compare(committed, rebuilt, f, errors, tiny)
    for m in tiny[:10]:
        print(f"::notice::last-digit rounding difference (allowed): {m}")
    if tiny:
        print(f"{len(tiny)} value(s) differ only in the last reported digit (allowed).")
    for m in errors[:20]:
        print(f"::error::{m}")
    if errors:
        print(f"{len(errors)} difference(s): run python product/build_site.py and commit the result.")
        return 1
    print("Site data matches data/raw.")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
