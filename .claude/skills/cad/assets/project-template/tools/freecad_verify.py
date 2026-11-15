"""FreeCAD console macro: independently inspect an exported STEP file."""

from __future__ import annotations

import json
import os
from pathlib import Path

import FreeCAD as App
import Part


step_path = Path(os.environ["CODEX_CAD_STEP"]).resolve()
output_path = Path(os.environ["CODEX_CAD_OUTPUT"]).resolve()
shape = Part.Shape()
shape.read(str(step_path))
read_ok = not shape.isNull()
solids = shape.Solids
box = shape.BoundBox

report = {
    "schema_version": 1,
    "source": str(step_path),
    "freecad_version": ".".join(App.Version()[:3]),
    "read_ok": bool(read_ok),
    "valid": shape.isValid(),
    "null": shape.isNull(),
    "solid_count": len(solids),
    "volume_mm3": shape.Volume,
    "surface_area_mm2": shape.Area,
    "bounding_box": {
        "min_mm": [box.XMin, box.YMin, box.ZMin],
        "max_mm": [box.XMax, box.YMax, box.ZMax],
        "size_mm": [box.XLength, box.YLength, box.ZLength],
    },
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if not report["read_ok"] or not report["valid"] or report["null"]:
    raise SystemExit(1)
