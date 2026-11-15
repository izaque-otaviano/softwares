"""Build exports and exact machine-readable geometry reports."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import cadquery as cq

from .model import CadModel, ModelParameters, build_model, mounting_hole_centers


def _shape(part: cq.Workplane) -> cq.Shape:
    value = part.val()
    if not isinstance(value, cq.Shape):
        raise TypeError(f"Expected a CadQuery Shape, got {type(value).__name__}")
    return value


def _bbox(shape: cq.Shape) -> dict[str, list[float]]:
    box = shape.BoundingBox()
    return {
        "min_mm": [box.xmin, box.ymin, box.zmin],
        "max_mm": [box.xmax, box.ymax, box.zmax],
        "size_mm": [box.xlen, box.ylen, box.zlen],
    }


def measurements(model: CadModel) -> dict[str, Any]:
    p = model.parameters
    base = _shape(model.parts["base"])
    lid = _shape(model.parts["lid"])
    compound = cq.Compound.makeCompound([base, lid])
    intersection = base.intersect(lid)
    centers = mounting_hole_centers(p)

    return {
        "schema_version": 1,
        "units": {"length": "mm", "area": "mm^2", "volume": "mm^3"},
        "assembly": {
            "bounding_box": _bbox(compound),
            "volume_mm3": compound.Volume(),
            "surface_area_mm2": compound.Area(),
            "solid_count": len(compound.Solids()),
        },
        "parts": {
            name: {
                "bounding_box": _bbox(_shape(part)),
                "volume_mm3": _shape(part).Volume(),
                "surface_area_mm2": _shape(part).Area(),
                "valid": _shape(part).isValid(),
            }
            for name, part in model.parts.items()
        },
        "features": {
            "wall_thickness_mm": {
                "value": p.wall,
                "provenance": "design_parameter",
            },
            "mounting_holes": {
                "count": len(centers),
                "diameter_mm": p.mounting_hole_diameter,
                "centers_xy_mm": centers,
                "center_spacing_mm": [
                    centers[-1][0] - centers[0][0],
                    centers[-1][1] - centers[0][1],
                ],
                "provenance": "design_parameter",
            },
            "lid_clearance_mm": {
                "nominal": p.lid_clearance,
                "measured_minimum": base.distance(lid),
                "provenance": "geometry",
            },
            "interference_volume_mm3": {
                "value": intersection.Volume(),
                "provenance": "geometry",
            },
        },
        "feature_manifest": model.feature_manifest,
    }


def validation(model: CadModel, report: dict[str, Any], tolerance: float = 1e-6) -> dict[str, Any]:
    p = model.parameters
    holes_area = 4 * math.pi * (p.mounting_hole_diameter / 2) ** 2
    expected_base_volume = (
        p.width * p.depth * p.base_height
        - (p.width - 2 * p.wall)
        * (p.depth - 2 * p.wall)
        * (p.base_height - p.wall)
        - holes_area * p.wall
    )
    checks = {
        "all_parts_valid": all(item["valid"] for item in report["parts"].values()),
        "component_names": set(model.parts) == {"base", "lid"},
        "solid_count": report["assembly"]["solid_count"] == 2,
        "no_interference": abs(
            report["features"]["interference_volume_mm3"]["value"]
        )
        <= tolerance,
        "lid_clearance": abs(
            report["features"]["lid_clearance_mm"]["measured_minimum"]
            - p.lid_clearance
        )
        <= tolerance,
        "base_volume": abs(
            report["parts"]["base"]["volume_mm3"] - expected_base_volume
        )
        <= tolerance,
    }
    return {
        "schema_version": 1,
        "tolerance_mm": tolerance,
        "checks": checks,
        "passed": all(checks.values()),
    }


def export_model(model: CadModel, output: Path, export_stl: bool = False) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for name, part in model.parts.items():
        cq.exporters.export(part, str(output / f"{name}.step"))
        if export_stl:
            cq.exporters.export(part, str(output / f"{name}.stl"))
    model.assembly.export(str(output / "enclosure.step"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("build"))
    parser.add_argument(
        "--stl",
        action="store_true",
        help="Also export per-part STL files; STEP remains the default",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model = build_model(ModelParameters())
    report = measurements(model)
    result = validation(model, report)
    export_model(model, args.output, export_stl=args.stl)
    (args.output / "measurements.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    (args.output / "validation.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Built {args.output.resolve()}")
    print(f"Validation: {'PASS' if result['passed'] else 'FAIL'}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
