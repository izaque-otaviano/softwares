# Fusion handoff

## Deliverables

Provide:

- one assembly STEP retaining component names and placements;
- optional per-component STEP files;
- `measurements.json` and `validation.json`;
- standard PNG views;
- fabrication meshes only when requested.

## Boundary of authority

STEP transfers precise solid and assembly geometry, not the CadQuery Python construction history, constraints, or parameter graph. Fusion imports STEP as new solid bodies/components. Direct modifications and new timeline features are possible, but they do not round-trip into CadQuery.

Before handoff:

1. rebuild from clean parameters;
2. pass all geometry tests;
3. verify the exported STEP in FreeCAD;
4. record a source revision or release identifier in `handoff.json`;
5. state whether CadQuery remains authoritative or Fusion becomes authoritative.

If CadQuery remains authoritative, treat Fusion operations as downstream finishing and expect face-dependent Fusion features to require repair after a regenerated STEP changes topology.

## Units and naming

Use millimetres consistently. Give assembly nodes stable semantic names. Confirm names and placements after import; do not assume a translator preserved every item of metadata.
