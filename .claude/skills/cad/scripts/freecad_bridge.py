#!/usr/bin/env python3
"""Run the bundled FreeCAD verification or rendering macro."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("verify", "render"))
    parser.add_argument("--step", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--freecad", type=Path, help="Override the FreeCAD executable")
    parser.add_argument("--timeout", type=int, default=120)
    return parser.parse_args()


def executable_candidates(mode: str) -> list[Path]:
    names = ["freecadcmd", "FreeCADCmd"] if mode == "verify" else ["freecad", "FreeCAD"]
    candidates: list[Path] = []
    for name in names:
        resolved = shutil.which(name)
        if resolved:
            candidates.append(Path(resolved))

    if sys.platform == "darwin":
        resource_bin = Path("/Applications/FreeCAD.app/Contents/Resources/bin")
        candidates.append(resource_bin / ("freecadcmd" if mode == "verify" else "freecad"))
    elif sys.platform == "win32":
        for base in (Path(os.environ.get("ProgramFiles", "")), Path(os.environ.get("LOCALAPPDATA", ""))):
            if str(base):
                candidates.extend(base.glob("FreeCAD*/bin/FreeCADCmd.exe" if mode == "verify" else "FreeCAD*/bin/FreeCAD.exe"))
    return candidates


def find_executable(mode: str, override: Path | None) -> Path:
    candidates = [override.expanduser()] if override else executable_candidates(mode)
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    searched = "\n".join(f"  - {path}" for path in candidates) or "  (no candidates)"
    raise SystemExit(f"Could not find a FreeCAD executable. Searched:\n{searched}")


def main() -> int:
    args = parse_args()
    step = args.step.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not step.is_file():
        raise SystemExit(f"STEP input does not exist: {step}")

    skill_root = Path(__file__).resolve().parent.parent
    macro = skill_root / "assets" / "project-template" / "tools" / f"freecad_{args.mode}.py"
    executable = find_executable(args.mode, args.freecad)

    env = os.environ.copy()
    env["CODEX_CAD_STEP"] = str(step)
    env["CODEX_CAD_OUTPUT"] = str(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.mode == "render":
        output.mkdir(parents=True, exist_ok=True)

    command = [str(executable), str(macro)]
    print("Running:", " ".join(command), flush=True)
    started_at = time.time()
    try:
        completed = subprocess.run(command, env=env, timeout=args.timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(f"FreeCAD {args.mode} timed out after {args.timeout}s") from exc
    if completed.returncode:
        raise SystemExit(
            f"FreeCAD {args.mode} failed with status {completed.returncode}. "
            "In Codex Desktop, retry the FreeCAD launch outside the sandbox if Qt reports "
            "an incompatible processor or unavailable display."
        )
    expected = (
        [output]
        if args.mode == "verify"
        else [output / f"{name}.png" for name in ("isometric", "front", "top", "right")]
    )
    missing = [
        path
        for path in expected
        if not path.is_file()
        or path.stat().st_size == 0
        or path.stat().st_mtime < started_at - 1.0
    ]
    if missing:
        rendered = "\n".join(f"  - {path}" for path in missing)
        raise SystemExit(
            f"FreeCAD exited without producing fresh {args.mode} output:\n{rendered}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
