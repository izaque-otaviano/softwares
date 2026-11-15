# Design for 3D printing

## Establish the manufacturing profile

Before optimizing geometry, record:

- process: FDM/FFF, SLA/DLP/MSLA, SLS, or another process;
- printer build volume and usable margins;
- material and expected shrinkage or flexibility;
- nozzle diameter and layer height for FDM, or resin/process limits;
- required fit: free, sliding, snap, press, threaded, or bonded;
- load direction, temperature, moisture, and other service conditions.

When details are unknown, use clearly labelled provisional parameters and ask only for facts that materially change the design. Never silently bake a generic “3D-printing tolerance” into geometry.

## Common checks

- Keep every final body valid, closed, non-self-intersecting, and positively volumed.
- Confirm the oriented model fits inside the usable build volume.
- Measure minimum walls, pins, slots, gaps, embossed/engraved detail, and hole diameters.
- Parameterize mating clearances and calibration compensation separately from nominal dimensions.
- Review print orientation for support demand, surface quality, dimensional accuracy, bed adhesion, and load anisotropy.
- Avoid inaccessible support cavities. Split the model or add assembly features when support removal is unrealistic.
- Add chamfers or deliberate first-layer relief where elephant-foot deformation would affect fit.
- Treat small vertical and horizontal holes separately; printed holes commonly need process-specific compensation.
- Check that thin floors, roofs, bridges, and overhangs are compatible with the selected process and orientation.

## FDM/FFF

- Relate walls and small features to nozzle width and intended perimeter count.
- Align primary loads to avoid weak inter-layer tension where possible.
- Review bridges and unsupported overhangs against the actual printer/material profile.
- Provide heat-set-insert bosses, captive-nut pockets, thread forms, or pilot holes using manufacturer and process dimensions.
- Consider brim/raft needs, warping, shrinkage, seam placement, and support-interface scars.

## Resin

- Avoid sealed cavities and suction cups.
- For hollow parts, provide adequate drain and vent paths at orientation-aware low and high points.
- Check for trapped resin, unsupported islands, peel forces, and access for washing and curing.
- Keep supports away from critical fit and cosmetic surfaces when possible.

## CAD deliverables

Keep Python and STEP as the default design deliverables. Never generate 3MF. Generate STL as a retained deliverable only when the user explicitly requests a printable mesh. A slicer-validation loop may use a temporary STL that is deleted after validation.

For each printer-aware CAD design:

1. preserve a canonical parametric model;
2. record printer/process assumptions separately from nominal geometry;
3. verify dimensions, build-volume bounds, minimum features, clearances, and valid solids;
4. render the canonical model and the intended print orientation when useful;
5. export STEP and the measurement/validation reports;
6. export STL only on request, then verify its millimetre scale, connected-component count, bounds, and manifold/closed status;
7. when slicer validation is requested, use a temporary print-oriented STL and retain only the normalized printability report.

Report CAD checks separately from slicer checks. Do not imply that support generation, print simulation, or physical calibration was performed unless that exact operation was completed.
