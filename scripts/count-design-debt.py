#!/usr/bin/env python3
"""Count hardcoded design values (colors, numeric props) in the codebase.

Scans museum-frontend and museum-web for design debt:
  - Hex color literals in .ts/.tsx
  - rgba() calls in .ts/.tsx (excluding tokens.functional.*)
  - Numeric design props in .ts/.tsx (excluding tokens.semantic.*)

Usage:
  python3 scripts/count-design-debt.py              # JSON to stdout
  python3 scripts/count-design-debt.py --verbose     # + human summary to stderr
  python3 scripts/count-design-debt.py --fail-on-debt # exit 1 if total > 0
"""

import json
import os
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCAN_DIRS = [
    "museum-frontend/app",
    "museum-frontend/features",
    "museum-frontend/shared/ui",
    "museum-web/src",
]

EXCLUDED_DIRS = {"node_modules", ".test-dist", "__tests__", "android"}

EXCLUDED_FILE_PATTERNS = [
    re.compile(r"\.test\.\w+$"),
    re.compile(r"\.snap$"),
    re.compile(r"tokens\.generated\.(ts|css)$"),
    re.compile(r"tokens\.functional\.(ts|css)$"),
    re.compile(r"tokens\.semantic\.(ts|css)$"),
    re.compile(r"globals\.css$"),
    re.compile(r"seo\.ts$"),
]

EXTENSIONS = {".ts", ".tsx", ".css"}

# Patterns
HEX_COLOR_RE = re.compile(r"""['"]#[0-9a-fA-F]{3,8}['"]""")
RGBA_RE = re.compile(r"""rgba?\(""")
NUMERIC_PROP_RE = re.compile(
    r"(fontSize|gap|padding\w*|margin\w*|borderRadius|borderWidth"
    r"|width|height|lineHeight):\s*(\d+)"
)

# Props that look like design props but are not design debt
SKIP_PROPS = {
    "opacity",
    "flex",
    "zIndex",
    "aspectRatio",
    "shadowOpacity",
    "shadowRadius",
    "fontWeight",
    "elevation",
}

# Zero values are acceptable
ZERO_VALUE_RE = re.compile(
    r"(fontSize|gap|padding\w*|margin\w*|borderRadius|borderWidth"
    r"|width|height|lineHeight):\s*0(?:\s*[,}\n]|$)"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def should_exclude_dir(dir_name: str) -> bool:
    return dir_name in EXCLUDED_DIRS


def should_exclude_file(file_path: Path) -> bool:
    name = file_path.name
    for pattern in EXCLUDED_FILE_PATTERNS:
        if pattern.search(name):
            return True
    return False


def is_tokens_functional(file_path: Path) -> bool:
    return file_path.name.startswith("tokens.functional.")


def is_tokens_semantic(file_path: Path) -> bool:
    return file_path.name.startswith("tokens.semantic.")


def collect_files(root: Path) -> list:
    """Walk scan dirs and collect eligible files."""
    files = []
    for scan_dir in SCAN_DIRS:
        target = root / scan_dir
        if not target.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(target):
            # Prune excluded directories in-place
            dirnames[:] = [
                d for d in dirnames if not should_exclude_dir(d)
            ]
            for fname in filenames:
                fpath = Path(dirpath) / fname
                if fpath.suffix not in EXTENSIONS:
                    continue
                if should_exclude_file(fpath):
                    continue
                files.append(fpath)
    return files


def count_hex_colors(content: str, file_path: Path) -> int:
    """Count hex color literals in .ts/.tsx files."""
    if file_path.suffix not in {".ts", ".tsx"}:
        return 0
    return len(HEX_COLOR_RE.findall(content))


def count_rgba_colors(content: str, file_path: Path) -> int:
    """Count rgba() calls in .ts/.tsx (skip tokens.functional.*, CSS, var() refs)."""
    if file_path.suffix not in {".ts", ".tsx"}:
        return 0
    if is_tokens_functional(file_path):
        return 0
    count = 0
    for line in content.splitlines():
        stripped = line.strip()
        # Skip comments
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
            continue
        # Skip lines that are var(--fn-...) references (already tokenized)
        if "var(--fn-" in line or "var(--sem-" in line:
            continue
        # Skip box-shadow composite values (multi-stop, hard to tokenize)
        if "box-shadow" in line.lower() or "boxShadow" in line:
            continue
        # Skip animation keyframes
        if "animation" in line.lower() or "@keyframes" in line:
            continue
        # Skip gradient stops (linear-gradient, radial-gradient)
        if "gradient" in line.lower():
            continue
        # Skip backdrop-filter values
        if "backdrop" in line.lower() or "backdropFilter" in line:
            continue
        # Skip bezel/frame/chrome highlight gradients in style strings
        if "background:" in line and ("linear" in line or "radial" in line):
            continue
        # Skip border shorthand with rgba (e.g., `border: 1px solid rgba(...)`)
        if "border" in line.lower() and "rgba" in line:
            continue
        # Skip filter values
        if "filter" in line.lower():
            continue
        # Count actual rgba( occurrences
        count += len(RGBA_RE.findall(line))
    return count


def count_numeric_props(content: str, file_path: Path) -> int:
    """Count numeric design props in .ts/.tsx (skip tokens.semantic.*)."""
    if file_path.suffix not in {".ts", ".tsx"}:
        return 0
    if is_tokens_semantic(file_path):
        return 0

    count = 0
    for line in content.splitlines():
        stripped = line.strip()
        # Skip lines that match skip props (false positives)
        skip = False
        for prop in SKIP_PROPS:
            if stripped.startswith(prop + ":") or stripped.startswith(prop + " :"):
                skip = True
                break
        if skip:
            continue

        for match in NUMERIC_PROP_RE.finditer(line):
            prop_name = match.group(1)
            value = match.group(2)
            # Skip zero values
            if value == "0":
                continue
            # Skip props in the exclusion set (shouldn't match regex, but guard)
            if prop_name in SKIP_PROPS:
                continue
            # Skip shadowOffset inner values (width/height inside shadowOffset obj)
            if "shadowOffset" in line:
                continue
            # Skip SEO/OG metadata dimensions
            if "openGraph" in line or "og:" in line:
                continue
            # Skip Recharts/chart library config props (margin, radius in chart elements)
            if "CartesianGrid" in line or "<Bar " in line or "<Line " in line or "Margin" in line:
                continue
            if "margin:" in line and ("left:" in line or "right:" in line or "top:" in line or "bottom:" in line):
                continue
            count += 1
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    verbose = "--verbose" in sys.argv
    fail_on_debt = "--fail-on-debt" in sys.argv

    # Determine repo root: script lives in <root>/scripts/
    script_dir = Path(__file__).resolve().parent
    root = script_dir.parent

    files = collect_files(root)

    total_hex = 0
    total_rgba = 0
    total_numeric = 0
    file_results = []

    for fpath in sorted(files):
        try:
            content = fpath.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        h = count_hex_colors(content, fpath)
        r = count_rgba_colors(content, fpath)
        n = count_numeric_props(content, fpath)

        if h + r + n > 0:
            rel = str(fpath.relative_to(root))
            file_results.append({
                "path": rel,
                "hex": h,
                "rgba": r,
                "numeric": n,
                "total": h + r + n,
            })
            total_hex += h
            total_rgba += r
            total_numeric += n

    total = total_hex + total_rgba + total_numeric

    result = {
        "total": total,
        "hex_colors": total_hex,
        "rgba_colors": total_rgba,
        "numeric_props": total_numeric,
        "files": sorted(file_results, key=lambda f: -f["total"]),
    }

    # JSON to stdout
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")

    # Human-readable summary to stderr
    if verbose:
        sys.stderr.write("\n--- Design Debt Summary ---\n")
        sys.stderr.write("  Hex colors:     %d\n" % total_hex)
        sys.stderr.write("  RGBA colors:    %d\n" % total_rgba)
        sys.stderr.write("  Numeric props:  %d\n" % total_numeric)
        sys.stderr.write("  TOTAL:          %d\n" % total)
        sys.stderr.write("\n")
        if file_results:
            sys.stderr.write("  Top offenders:\n")
            for f in sorted(file_results, key=lambda x: -x["total"])[:15]:
                sys.stderr.write(
                    "    %4d  %s\n" % (f["total"], f["path"])
                )
        sys.stderr.write("\n")

    if fail_on_debt and total > 0:
        sys.stderr.write(
            "FAIL: %d hardcoded design values found. "
            "Migrate to design tokens.\n" % total
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
