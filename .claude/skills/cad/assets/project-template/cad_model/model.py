"""Example two-component enclosure with stable semantic feature metadata."""

from __future__ import annotations

from dataclasses import dataclass

import cadquery as cq


@dataclass(frozen=True)
class ModelParameters:
    """All linear values are millimetres."""

    width: float = 100.0
    depth: float = 64.0
    base_height: float = 24.0
    wall: float = 2.4
    lid_thickness: float = 2.4
    lid_clearance: float = 0.4
    mounting_hole_diameter: float = 4.2
    mounting_hole_inset: float = 9.0

    def validate(self) -> None:
        positive = {
            "width": self.width,
            "depth": self.depth,
            "base_height": self.base_height,
            "wall": self.wall,
            "lid_thickness": self.lid_thickness,
            "mounting_hole_diameter": self.mounting_hole_diameter,
        }
        for name, value in positive.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive, got {value}")
        if self.lid_clearance < 0:
            raise ValueError("lid_clearance cannot be negative")
        if self.width <= 2 * self.wall or self.depth <= 2 * self.wall:
            raise ValueError("wall thickness leaves no internal cavity")
        if self.base_height <= self.wall:
            raise ValueError("base_height must exceed the floor thickness")
        if self.mounting_hole_inset <= self.mounting_hole_diameter / 2:
            raise ValueError("mounting holes are too close to an outer edge")


@dataclass(frozen=True)
class CadModel:
    parameters: ModelParameters
    parts: dict[str, cq.Workplane]
    assembly: cq.Assembly
    feature_manifest: dict[str, object]


def mounting_hole_centers(p: ModelParameters) -> list[tuple[float, float]]:
    x_values = (p.mounting_hole_inset, p.width - p.mounting_hole_inset)
    y_values = (p.mounting_hole_inset, p.depth - p.mounting_hole_inset)
    return [(x, y) for x in x_values for y in y_values]


def _base(p: ModelParameters) -> cq.Workplane:
    outer = cq.Workplane("XY").box(
        p.width, p.depth, p.base_height, centered=(False, False, False)
    )
    cavity = (
        cq.Workplane("XY")
        .box(
            p.width - 2 * p.wall,
            p.depth - 2 * p.wall,
            p.base_height - p.wall,
            centered=(False, False, False),
        )
        .translate((p.wall, p.wall, p.wall))
    )
    result = outer.cut(cavity)
    for x, y in mounting_hole_centers(p):
        cutter = (
            cq.Workplane("XY")
            .center(x, y)
            .circle(p.mounting_hole_diameter / 2)
            .extrude(p.wall)
        )
        result = result.cut(cutter)
    return result


def _lid(p: ModelParameters) -> cq.Workplane:
    return (
        cq.Workplane("XY")
        .box(p.width, p.depth, p.lid_thickness, centered=(False, False, False))
        .translate((0, 0, p.base_height + p.lid_clearance))
    )


def build_model(parameters: ModelParameters | None = None) -> CadModel:
    p = parameters or ModelParameters()
    p.validate()
    base = _base(p)
    lid = _lid(p)

    assembly = cq.Assembly(name="enclosure")
    assembly.add(base, name="base", color=cq.Color(0.72, 0.75, 0.80))
    assembly.add(lid, name="lid", color=cq.Color(0.25, 0.48, 0.82))

    centers = mounting_hole_centers(p)
    manifest: dict[str, object] = {
        "base": {"part": "base", "role": "open enclosure body"},
        "lid": {"part": "lid", "role": "removable cover"},
        "mounting_holes": {
            "part": "base",
            "diameter_mm": p.mounting_hole_diameter,
            "centers_xy_mm": centers,
            "axis": [0.0, 0.0, 1.0],
        },
        "interior": {
            "part": "base",
            "size_mm": [
                p.width - 2 * p.wall,
                p.depth - 2 * p.wall,
                p.base_height - p.wall,
            ],
        },
    }
    return CadModel(p, {"base": base, "lid": lid}, assembly, manifest)
