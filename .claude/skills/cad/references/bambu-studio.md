# Bambu Studio validation

Use this workflow for local, printer-profile-aware validation after topology and dimensional checks pass.

## Scope

The bundled validator:

- accepts an STL in its intended print orientation;
- locates Bambu Studio and its installed system profiles;
- resolves inherited machine, process, and filament presets into complete temporary profiles;
- performs a local slice with normative checks enabled;
- records slicer identity, chosen profiles, object bounds, layer height, wall count, infill, estimated time, material use, warnings, and toolpath feature times;
- removes transient STL copies, G-code, flattened profiles, and slicer data;
- never creates 3MF and never communicates with a printer.

Use the report to find rasterization failures, out-of-bounds geometry, slicer warnings, and whether support or bridge toolpaths appear. Continue to use CAD-side analysis for exact overhang angles, bridge spans, minimum walls, clearances, and load orientation: slicer statistics alone do not prove that a part will print well.

## P2S default

The default profile is:

- machine: `Bambu Lab P2S 0.4 nozzle`;
- process: `0.20mm Standard @BBL P2S`;
- filament: `Bambu PLA Basic @BBL P2S`;
- plate: `Textured PEI Plate`.

These are provisional unless they match the physical setup. Pass exact preset names when using another nozzle, material, process, or build plate:

```bash
python <skill-dir>/scripts/bambu_studio_validate.py \
  --stl build/part-print-oriented.stl \
  --output build/printability.json \
  --machine "Bambu Lab P2S 0.6 nozzle" \
  --process "0.30mm Standard @BBL P2S 0.6 nozzle" \
  --filament "Bambu PLA Basic @BBL P2S 0.6 nozzle" \
  --bed-type "Textured PEI Plate"
```

## Interpretation

Require all of the following for a passing dry-run:

- the Bambu Studio process exits successfully;
- its `result.json` reports success and at least one sliced plate;
- the requested printer model and nozzle are present in the flattened machine profile;
- every object fits the effective printable XY bounds and printable height;
- no slicer warning is present.

Review these fields even when the report passes:

- `estimated_print_time_s`;
- `filament_used_g`;
- `feature_type_times_s`, especially bridge and support categories;
- `support_toolpaths_detected`;
- `floating_cantilever_detected`;
- `warnings`;
- object bounding boxes.

A zero support-toolpath result means the selected process generated no supports. It does not independently prove that supports are unnecessary. If support need is uncertain, combine an exact CAD overhang/bridge analysis with a second slice using the intended automatic-support settings and compare the report.

## Failure handling

- Preserve the normalized JSON report, including the final log lines, when slicing fails.
- Treat missing or incompatible profiles as a validation failure.
- Treat a reported build envelope that disagrees with the flattened machine preset as a validation failure.
- Pin or record the Bambu Studio version because CLI behavior and bundled profiles can change.
- Use the Bambu Studio GUI for final layer-by-layer review before fabrication.
- Do not automatically fall back to another printer profile. OrcaSlicer may be used only with an explicitly selected compatible profile and should be reported as a different validation environment.
