# Geometry measurements

## Automatic report

Use `cad_model.build.measurements()` as the single machine-readable report entry point. Keep every length in millimetres and include a top-level `units` object.

Classify values by provenance:

- `geometry`: queried from the final solid, such as bounding boxes, area, volume, distance, or intersection volume.
- `design_parameter`: intentionally declared, such as nominal wall thickness or hole diameter.
- `derived_parameter`: arithmetic over declared parameters, such as hole spacing or nominal clearance.

Test critical measurements rather than merely recording them. Use tolerances appropriate to OpenCascade floating-point operations; `1e-6 mm` is suitable for simple analytic starter geometry.

## Interactive FreeCAD selection

Open the generated STEP or native document, select one or two vertices, edges, faces, or bodies, and execute `tools/freecad_selection_report.py` as a FreeCAD macro.

The macro writes `build/selection.json` beside the open document when it has been saved. Otherwise it writes under the current directory. It reports:

- object and sub-element names;
- shape types and centers of mass;
- bounding boxes, length, area, and volume where applicable;
- exact minimum distance between the first two selected shapes;
- closest-point pairs returned by OpenCascade.

Use the highlighted FreeCAD view for semantic context, but quote the JSON value as the measurement. If selection names become invalid after regeneration, ask the user to select again rather than guessing.

## Clearances and interference

For two components `a` and `b`:

- use `a.distance(b)` for minimum clearance when they do not overlap;
- use `a.intersect(b).Volume()` for interference;
- report both because a distance of zero can mean either touching or overlapping.

For assemblies with intended fits, encode the nominal fit in parameters and independently measure the final solids.
