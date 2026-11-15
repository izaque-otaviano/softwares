"""FreeCAD GUI macro: report exact properties of selected sub-elements."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import FreeCAD as App
import FreeCADGui as Gui


def vector(value: Any) -> list[float]:
    return [value.x, value.y, value.z]


def shape_report(shape: Any) -> dict[str, Any]:
    box = shape.BoundBox
    report: dict[str, Any] = {
        "shape_type": shape.ShapeType,
        "center_of_mass_mm": vector(shape.CenterOfMass),
        "bounding_box": {
            "min_mm": [box.XMin, box.YMin, box.ZMin],
            "max_mm": [box.XMax, box.YMax, box.ZMax],
            "size_mm": [box.XLength, box.YLength, box.ZLength],
        },
    }
    for attribute, key in (
        ("Length", "length_mm"),
        ("Area", "area_mm2"),
        ("Volume", "volume_mm3"),
    ):
        if hasattr(shape, attribute):
            report[key] = getattr(shape, attribute)
    return report


selected: list[tuple[str, str, Any]] = []
items: list[dict[str, Any]] = []
for entry in Gui.Selection.getSelectionEx():
    if entry.SubObjects:
        for name, shape in zip(entry.SubElementNames, entry.SubObjects):
            selected.append((entry.ObjectName, name, shape))
            items.append(
                {
                    "object": entry.ObjectName,
                    "sub_element": name,
                    **shape_report(shape),
                }
            )
    else:
        shape = entry.Object.Shape
        selected.append((entry.ObjectName, "", shape))
        items.append(
            {"object": entry.ObjectName, "sub_element": "", **shape_report(shape)}
        )

report: dict[str, Any] = {
    "schema_version": 1,
    "units": {"length": "mm", "area": "mm^2", "volume": "mm^3"},
    "selection": items,
}
if len(selected) >= 2:
    distance, closest, _ = selected[0][2].distToShape(selected[1][2])
    report["first_pair"] = {
        "minimum_distance_mm": distance,
        "closest_points_mm": [
            [vector(pair[0]), vector(pair[1])] for pair in closest
        ],
    }

override = os.environ.get("CODEX_CAD_SELECTION_OUTPUT")
if override:
    output = Path(override).expanduser().resolve()
elif App.ActiveDocument and App.ActiveDocument.FileName:
    output = Path(App.ActiveDocument.FileName).resolve().parent / "build" / "selection.json"
else:
    output = Path.cwd() / "build" / "selection.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {output}")
