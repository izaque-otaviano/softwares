#!/usr/bin/env python3
"""Copy the bundled CadQuery/FreeCAD starter into an empty target directory."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="New or empty project directory")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = args.target.expanduser().resolve()
    template = Path(__file__).resolve().parent.parent / "assets" / "project-template"

    if not template.is_dir():
        raise SystemExit(f"Bundled template is missing: {template}")

    target.mkdir(parents=True, exist_ok=True)
    existing = list(target.iterdir())
    if existing:
        names = ", ".join(sorted(path.name for path in existing[:5]))
        raise SystemExit(
            f"Refusing to scaffold into non-empty directory {target} ({names}). "
            "Choose an empty directory or integrate the template manually."
        )

    shutil.copytree(template, target, dirs_exist_ok=True)
    print(f"Created CadQuery project at {target}")
    print("Next: conda env create -p .conda-env -f environment.yml")
    print("Then: .conda-env/bin/python -m cad_model.build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
