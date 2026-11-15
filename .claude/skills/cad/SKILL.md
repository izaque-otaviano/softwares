---
name: cad
description: Use whenever the user starts a request with "With CAD," or explicitly invokes $cad. Create, modify, validate, measure, render, and export printer-aware parametric mechanical CAD models using CadQuery and FreeCAD, with optional local Bambu Studio dry-run slicing and STEP handoff to Fusion. Use for parts or assemblies intended for 3D printing, dimension-driven enclosures and fixtures, fit and clearance design, printability checks, exact geometry reports, CAD preview images, FreeCAD measurements, or Fusion preparation.
---

# CAD

Build printer-aware mechanical CAD as reproducible Python. Treat CadQuery source and parameters as authoritative, use FreeCAD for independent STEP validation and images, and hand off STEP solids to Fusion when requested.

Treat the prefix `With CAD,` as an explicit invocation of this skill and the remainder as the CAD task.

## Start safely

1. Inspect the target directory and preserve existing project conventions.
2. Probe `python`, CadQuery, pytest, and FreeCAD before installing anything.
3. For a new or empty project, scaffold from the bundled template:

   ```bash
   python <skill-dir>/scripts/init_cad_project.py <target-dir>
   ```

4. Read `references/measurements.md` when exact measurements or interactive selections matter.
5. Read `references/3d-printing.md` for every part intended for fabrication.
6. Read `references/bambu-studio.md` before slicing with Bambu Studio.
7. Read `references/fusion-handoff.md` before preparing a Fusion delivery.

Do not add MCP by default. Use files and subprocesses unless the user repeatedly needs live control of an open CAD session.

## Model

- Put design intent in typed parameters with explicit millimetre units.
- Return named parts and an assembly from `cad_model/model.py`.
- Represent important features semantically in `feature_manifest`; do not make downstream logic depend only on `Face17` or similar transient topology.
- Prefer constructive geometry and stable workplanes. Expect face/edge identifiers to change after parameter edits.
- Keep generated files under `build/`; never edit generated STEP or optional STL files as source.

For an existing native FreeCAD model, keep its native document authoritative unless the user explicitly asks to migrate it to CadQuery.

## Build and verify

Run from the project root:

```bash
.conda-env/bin/python -m cad_model.build
.conda-env/bin/python -m pytest
python <skill-dir>/scripts/freecad_bridge.py verify \
  --step build/enclosure.step \
  --output build/freecad-verification.json
python <skill-dir>/scripts/freecad_bridge.py render \
  --step build/enclosure.step \
  --output build/renders
```

If the environment does not exist, create it from `environment.yml` only after dependency installation is authorized.

The FreeCAD bridge locates standard macOS, Linux, and Windows installations. GUI rendering may require execution outside the Codex sandbox. If a sandboxed launch reports a Qt or CPU-feature error, retry the exact FreeCAD command with the normal GUI/external-execution approval rather than diagnosing the model as broken.

Always inspect the generated PNGs with the available local-image viewer. Images validate appearance; geometry reports and tests validate dimensions.

## Measure

- Derive bounding boxes, volume, area, distance, clearance, and interference from solid topology.
- Record units and measurement provenance in JSON.
- Distinguish calculated geometry values from declared design parameters.
- Add explicit assertions for user-critical dimensions and tolerances.
- For ad hoc measurements, have the user select sub-elements in FreeCAD and run `tools/freecad_selection_report.py` from the generated project.
- Never estimate a dimension from a screenshot when exact topology is available.

## Iterate

After each material model change:

1. Rebuild all generated artifacts.
2. Run Python geometry tests.
3. Verify the exported STEP independently with FreeCAD.
4. Regenerate and inspect standard views.
5. Report changed parameters, measurements, validation results, and output paths.

Do not declare success when a model merely renders. Require valid solids, expected component names, and passing critical-dimension checks.

## Design for the intended printer

- Establish a design profile: process, printer/build volume, material, nozzle and layer height or resin constraints, required fit class, and load direction.
- If profile details are missing, state provisional assumptions and keep them parameterized. Do not present generic clearances or wall thicknesses as universal.
- Check build-volume fit in the intended orientation, minimum walls and features, holes, mating clearances, unsupported overhangs, bridges, support removal, bed contact, and anisotropic load direction.
- For resin, additionally check hollowing, drain and vent paths, trapped resin, suction cups, islands, and support access.
- Keep canonical design coordinates separate from the print-orientation transform when practical.
- Produce Python, STEP, measurements, validation reports, and renders by default. Generate STL only when the user requests it; never generate 3MF.
- When STL is requested, validate that it is nonempty, closed/manifold, correctly scaled in millimetres, and contains the expected connected components.
- Generate renders in both canonical and intended print orientations when orientation materially affects supports or strength.
- Report printer-aware CAD checks without claiming to have sliced unless the slicer validation loop was actually run.

## Validate with Bambu Studio

When the user requests slicer validation or the target printer is a Bambu printer with Bambu Studio available, offer or run a local dry-run slice after the CAD checks. For the configured P2S workflow:

```bash
python <skill-dir>/scripts/bambu_studio_validate.py \
  --stl /absolute/path/to/print-oriented-part.stl \
  --output /absolute/path/to/build/printability.json
```

The validator defaults to the installed P2S 0.4 mm nozzle, 0.20 mm Standard process, Bambu PLA Basic, and Textured PEI Plate profiles. Override these whenever the actual nozzle, process, material, or plate differs.

- Export the print-oriented STL into a temporary directory when STL is needed only for validation.
- Retain `printability.json`; do not retain the temporary STL, G-code, slicer cache, or logs unless the user asks for diagnostic artifacts.
- Never create 3MF as part of this loop.
- Never upload, transmit, or start a print. This is local slicing only.
- Require the report to identify the exact slicer version and profile files.
- Treat a successful slice as evidence that toolpaths can be generated, not as a guarantee of adhesion, warping behavior, strength, dimensional accuracy, or successful support removal.
- Inspect slicer warnings and support/toolpath indicators together with the CAD overhang, bridge, wall, clearance, and orientation checks.
- Fail safely if the effective printer profile or build envelope cannot be established; do not silently accept slicer fallback defaults.

## Hand off to Fusion

Export STEP for solids or assemblies. Preserve component names and placements. Explain that Fusion receives editable solid bodies but not CadQuery’s feature history or parameters. Keep foundational changes in CadQuery until the user explicitly records a handoff version and makes Fusion authoritative.

Generate STL only when requested for printing. Use STEP for the Fusion design handoff.
