#!/usr/bin/env python3
"""Dry-run slice an STL with installed Bambu Studio and retain only a JSON report."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


DEFAULT_MACHINE = "Bambu Lab P2S 0.4 nozzle"
DEFAULT_PROCESS = "0.20mm Standard @BBL P2S"
DEFAULT_FILAMENT = "Bambu PLA Basic @BBL P2S"
DEFAULT_BED_TYPE = "Textured PEI Plate"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stl", required=True, type=Path, help="Print-oriented STL")
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Normalized JSON report to retain",
    )
    parser.add_argument("--machine", default=DEFAULT_MACHINE)
    parser.add_argument("--process", default=DEFAULT_PROCESS)
    parser.add_argument("--filament", default=DEFAULT_FILAMENT)
    parser.add_argument("--bed-type", default=DEFAULT_BED_TYPE)
    parser.add_argument("--bambu-studio", type=Path)
    parser.add_argument("--profiles-root", type=Path)
    parser.add_argument("--timeout", type=float, default=300.0)
    return parser.parse_args()


def locate_bambu(explicit: Path | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(explicit.expanduser())
    found = shutil.which("bambu-studio") or shutil.which("BambuStudio")
    if found:
        candidates.append(Path(found))
    candidates.extend(
        [
            Path("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"),
            Path("/usr/bin/bambu-studio"),
            Path("/usr/local/bin/bambu-studio"),
        ]
    )
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate.resolve()
    raise FileNotFoundError("Bambu Studio executable was not found")


def locate_profiles(binary: Path, explicit: Path | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(explicit.expanduser())
    candidates.extend(
        [
            binary.parent.parent / "Resources" / "profiles" / "BBL",
            binary.parent.parent / "resources" / "profiles" / "BBL",
            Path("/usr/share/bambu-studio/resources/profiles/BBL"),
        ]
    )
    for candidate in candidates:
        if (candidate / "machine").is_dir() and (candidate / "process").is_dir():
            return candidate.resolve()
    raise FileNotFoundError("Bambu Studio BBL profile directory was not found")


def preset_path(root: Path, kind: str, name: str) -> Path:
    candidate = root / kind / f"{name}.json"
    if not candidate.is_file():
        raise FileNotFoundError(f"{kind} preset not found: {name}")
    return candidate


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def flatten_preset(root: Path, kind: str, name: str) -> tuple[dict[str, Any], list[Path]]:
    directory = root / kind
    visited: set[str] = set()
    sources: list[Path] = []

    def resolve(current_name: str) -> dict[str, Any]:
        if current_name in visited:
            raise ValueError(f"Preset inheritance cycle at {current_name}")
        visited.add(current_name)
        path = directory / f"{current_name}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Referenced {kind} preset not found: {current_name}")
        sources.append(path)
        current = load_json(path)
        merged: dict[str, Any] = {}
        parent = current.get("inherits")
        if isinstance(parent, str) and parent:
            merged.update(resolve(parent))
        includes = current.get("include", [])
        if isinstance(includes, str):
            includes = [includes]
        if isinstance(includes, list):
            for included in includes:
                if isinstance(included, str) and included:
                    merged.update(resolve(included))
        merged.update(current)
        visited.remove(current_name)
        return merged

    flattened = resolve(name)
    flattened.pop("include", None)
    # Bambu Studio treats a full user-loaded preset's ``inherits`` field as its
    # system-preset identity during CLI compatibility checks. Point it at the
    # selected leaf preset while retaining all resolved values in this file.
    flattened["inherits"] = name
    flattened["from"] = "User"
    flattened["name"] = name
    flattened["type"] = kind
    return flattened, sources


def profile_fingerprint(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(set(paths), key=str):
        digest.update(str(path).encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def xy_extent(profile: dict[str, Any]) -> tuple[float, float]:
    points = profile.get("printable_area")
    if not isinstance(points, list) or not points:
        raise ValueError("Flattened machine profile has no printable_area")
    parsed: list[tuple[float, float]] = []
    for point in points:
        match = re.fullmatch(
            r"\s*(-?(?:\d+(?:\.\d*)?|\.\d+))x(-?(?:\d+(?:\.\d*)?|\.\d+))\s*",
            str(point),
        )
        if not match:
            raise ValueError(f"Invalid printable_area point: {point!r}")
        parsed.append((float(match.group(1)), float(match.group(2))))
    return max(x for x, _ in parsed) - min(x for x, _ in parsed), max(
        y for _, y in parsed
    ) - min(y for _, y in parsed)


def scalar_float(value: Any, field: str) -> float:
    if isinstance(value, list):
        if not value:
            raise ValueError(f"Machine profile field {field} is empty")
        value = value[0]
    return float(value)


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def log_version(log: str) -> str | None:
    match = re.search(r"(?:BambuStudio-|Current BambuStudio Version )(\d[\d.]+)", log)
    return match.group(1) if match else None


def normalize(
    *,
    args: argparse.Namespace,
    binary: Path,
    root: Path,
    machine: dict[str, Any],
    process: dict[str, Any],
    sources: dict[str, list[Path]],
    completed: subprocess.CompletedProcess[str] | None,
    raw: dict[str, Any] | None,
    error: str | None,
) -> dict[str, Any]:
    log = completed.stdout if completed else ""
    log_warnings = [
        line.strip() for line in log.splitlines() if "[warning]" in line.lower()
    ]
    log_errors = [
        line.strip() for line in log.splitlines() if "[error]" in line.lower()
    ]
    cantilever_matches = re.findall(
        r"max_cantilever_dist=(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)",
        log,
        flags=re.IGNORECASE,
    )
    maximum_cantilever = (
        max(float(value) for value in cantilever_matches)
        if cantilever_matches
        else None
    )
    plates = raw.get("sliced_plates", []) if raw else []
    warnings = [
        plate.get("warning_message", "")
        for plate in plates
        if plate.get("warning_message")
    ]
    objects = [
        obj
        for plate in plates
        for obj in plate.get("objects", [])
        if isinstance(obj, dict)
    ]
    feature_times: dict[str, float] = {}
    for plate in plates:
        for name, seconds in plate.get("feature_type_times", {}).items():
            feature_times[name] = feature_times.get(name, 0.0) + float(seconds)
    support_features = {
        name: seconds
        for name, seconds in feature_times.items()
        if "support" in name.lower() and seconds > 0
    }
    width, depth = xy_extent(machine)
    height = scalar_float(machine.get("printable_height"), "printable_height")
    effective_matches = re.findall(
        r"reset_size:after size: plate_width ([\d.]+), plate_depth ([\d.]+), "
        r"plate_height ([\d.]+)",
        log,
    )
    effective_size = (
        [float(value) for value in effective_matches[-1]]
        if effective_matches
        else None
    )
    envelope_matches_profile = effective_size is not None and all(
        abs(actual - expected) <= 1e-6
        for actual, expected in zip(effective_size, [width, depth, height])
    )
    bounds_ok = all(
        float(obj.get("bbox", {}).get("width", width + 1)) <= width
        and float(obj.get("bbox", {}).get("depth", depth + 1)) <= depth
        and float(obj.get("bbox", {}).get("height", height + 1)) <= height
        for obj in objects
    )
    filament_used = sum(
        float(filament.get("total_used_g", 0.0))
        for plate in plates
        for filament in plate.get("filaments", [])
    )
    successful = (
        error is None
        and completed is not None
        and completed.returncode == 0
        and raw is not None
        and raw.get("return_code") == 0
        and bool(plates)
        and bool(objects)
        and bounds_ok
        and envelope_matches_profile
        and not warnings
    )
    if error:
        report_error = error
    elif completed is not None and completed.returncode != 0:
        report_error = (
            raw.get("error_string", f"Bambu Studio exited {completed.returncode}")
            if raw
            else f"Bambu Studio exited {completed.returncode}"
        )
    elif raw is not None and raw.get("return_code") != 0:
        report_error = raw.get("error_string", "Bambu Studio reported a slicing failure")
    elif not envelope_matches_profile:
        report_error = "Effective slicer build envelope did not match the machine profile"
    elif not bounds_ok:
        report_error = "One or more objects exceed the effective build envelope"
    elif warnings:
        report_error = "; ".join(warnings)
    elif not plates or not objects:
        report_error = "Bambu Studio did not report a sliced object"
    else:
        report_error = None
    return {
        "schema_version": 1,
        "passed": successful,
        "scope": "local dry-run slicing; no printer communication",
        "input": str(args.stl.resolve()),
        "slicer": {
            "name": "Bambu Studio",
            "version": log_version(log),
            "executable": str(binary),
            "exit_code": completed.returncode if completed else None,
        },
        "profiles": {
            "root": str(root),
            "machine": args.machine,
            "process": args.process,
            "filament": args.filament,
            "bed_type": args.bed_type,
            "source_sha256": {
                kind: profile_fingerprint(paths) for kind, paths in sources.items()
            },
        },
        "machine": {
            "printer_model": machine.get("printer_model"),
            "nozzle_diameter_mm": machine.get("nozzle_diameter"),
            "printable_size_mm": [width, depth, height],
            "effective_printable_size_mm": effective_size,
            "envelope_matches_profile": envelope_matches_profile,
        },
        "slice": {
            "layer_height_mm": raw.get("layer_height") if raw else None,
            "wall_loops": raw.get("wall_loops") if raw else None,
            "sparse_infill_percent": raw.get("sparse_infill_density") if raw else None,
            "estimated_print_time_s": sum(
                float(plate.get("total_predication", 0.0)) for plate in plates
            ),
            "filament_used_g": filament_used,
            "feature_type_times_s": feature_times,
            "support_toolpaths_detected": bool(support_features),
            "support_feature_times_s": support_features,
            "floating_cantilever_detected": bool(
                maximum_cantilever is not None and maximum_cantilever > 0
            ),
            "objects": objects,
            "warnings": warnings,
            "log_warnings": log_warnings,
            "log_errors": log_errors,
            "bounds_ok": bounds_ok,
        },
        "limitations": [
            "A successful slice does not guarantee adhesion, dimensional accuracy, strength, warping resistance, or removable supports.",
            "No support toolpaths does not independently prove that supports are unnecessary.",
        ],
        "transient_artifacts_retained": False,
        "three_mf_created": False,
        "error": report_error,
        "log_tail": log.splitlines()[-40:],
    }


def main() -> int:
    args = parse_args()
    args.stl = args.stl.expanduser().resolve()
    args.output = args.output.expanduser().resolve()
    if args.stl.suffix.lower() != ".stl" or not args.stl.is_file():
        raise SystemExit(f"Input must be an existing STL: {args.stl}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    binary = locate_bambu(args.bambu_studio)
    root = locate_profiles(binary, args.profiles_root)
    machine, machine_sources = flatten_preset(root, "machine", args.machine)
    process, process_sources = flatten_preset(root, "process", args.process)
    filament, filament_sources = flatten_preset(root, "filament", args.filament)
    sources = {
        "machine": machine_sources,
        "process": process_sources,
        "filament": filament_sources,
    }
    completed: subprocess.CompletedProcess[str] | None = None
    raw: dict[str, Any] | None = None
    error: str | None = None

    with tempfile.TemporaryDirectory(prefix="codex-bambu-validate-") as temporary:
        temp = Path(temporary)
        machine_path = temp / "machine.json"
        process_path = temp / "process.json"
        filament_path = temp / "filament.json"
        write_json(machine_path, machine)
        write_json(process_path, process)
        write_json(filament_path, filament)
        command = [
            str(binary),
            "--debug",
            "3",
            "--load-settings",
            f"{machine_path};{process_path}",
            "--load-filaments",
            str(filament_path),
            "--load-filament-ids",
            "1",
            f"--curr-bed-type={args.bed_type}",
            "--ensure-on-bed",
            "--arrange",
            "1",
            "--normative-check",
            "--slice",
            "0",
            "--outputdir",
            str(temp),
            str(args.stl),
        ]
        try:
            completed = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=args.timeout,
                check=False,
            )
            result_path = temp / "result.json"
            if result_path.is_file():
                raw = load_json(result_path)
            elif completed.returncode == 0:
                error = "Bambu Studio returned success without result.json"
        except subprocess.TimeoutExpired as exc:
            error = f"Bambu Studio exceeded {args.timeout:g} seconds"
            completed = subprocess.CompletedProcess(
                exc.cmd,
                124,
                stdout=(exc.stdout or "") + "\n" + (exc.stderr or ""),
            )
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"

        report = normalize(
            args=args,
            binary=binary,
            root=root,
            machine=machine,
            process=process,
            sources=sources,
            completed=completed,
            raw=raw,
            error=error,
        )
        write_json(args.output, report)

    print(f"Wrote {args.output}")
    print(f"Bambu Studio dry-run: {'PASS' if report['passed'] else 'FAIL'}")
    if not report["passed"] and report["error"]:
        print(f"Reason: {report['error']}", file=sys.stderr)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
