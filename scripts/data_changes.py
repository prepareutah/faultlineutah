#!/usr/bin/env python3
"""Summarize how the freshly built site/data differs from the last commit, in
plain language, for the monthly data-refresh pull request.

Run from the project root after scripts/build_data.py:  python3 scripts/data_changes.py
Prints Markdown. Exit code 0 always.
"""

import json
import os
import subprocess

DATA = "site/data"
DATASETS = [
    ("faults", "Fault lines (UGS)", "fault lines"),
    ("liq", "Liquefaction susceptibility (UGS, detailed)", "mapped areas"),
    ("liq94", "Liquefaction potential (1994 regional maps)", "mapped areas"),
    ("sfr", "Fault rupture study zones (UGS)", "zone pieces"),
]


def old(path):
    """Contents of a file at the last commit, or None if it didn't exist."""
    try:
        return subprocess.run(["git", "show", "HEAD:" + path], capture_output=True, check=True).stdout.decode()
    except subprocess.CalledProcessError:
        return None


def new(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        return None


def count_features(text):
    return len(json.loads(text)["features"]) if text else 0


def main():
    lines = []
    any_change = False
    for folder, title, unit in DATASETS:
        idx_path = f"{DATA}/{folder}/index.json"
        old_keys = set(json.loads(old(idx_path) or "[]"))
        new_keys = set(json.loads(new(idx_path) or "[]"))
        changed = before = after = 0
        for k in old_keys | new_keys:
            p = f"{DATA}/{folder}/{k}.json"
            o = old(p) if k in old_keys else None
            n = new(p) if k in new_keys else None
            before += count_features(o)
            after += count_features(n)
            if o != n:
                changed += 1
        if changed:
            any_change = True
            lines.append(f"- **{title}:** {changed} map tile{'s' if changed != 1 else ''} changed "
                         f"({len(new_keys - old_keys)} new, {len(old_keys - new_keys)} removed); "
                         f"{before:,} → {after:,} {unit} counted across tiles.")
        else:
            lines.append(f"- {title}: no change.")

    # Magna: the USGS keeps accepting "Did You Feel It?" reports, so small changes are routine.
    magna = [f for f in sorted(os.listdir(f"{DATA}/magna")) if old(f"{DATA}/magna/{f}") != new(f"{DATA}/magna/{f}")]
    if magna:
        any_change = True
        o, n = json.loads(old(f"{DATA}/magna/event.json") or "{}"), json.loads(new(f"{DATA}/magna/event.json") or "{}")
        felt = f" Felt reports: {o.get('felt'):,} → {n.get('felt'):,}." if o.get("felt") != n.get("felt") and o.get("felt") and n.get("felt") else ""
        lines.append(f"- **2020 Magna earthquake (USGS):** {', '.join(magna)} changed.{felt} Usually routine.")
    else:
        lines.append("- 2020 Magna earthquake (USGS): no change.")

    for f in ("faults_overview.json", "fault_summaries.json"):
        if old(f"{DATA}/{f}") != new(f"{DATA}/{f}"):
            any_change = True
            lines.append(f"- `{f}` changed (follows the fault lines above).")

    print("\n".join(lines))
    if not any_change:
        print("\nNothing changed.")


if __name__ == "__main__":
    main()
