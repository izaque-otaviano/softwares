from __future__ import annotations

from dataclasses import replace

import pytest

from cad_model.build import export_model, measurements, validation
from cad_model.model import ModelParameters, build_model


def test_default_model_is_valid_and_separate() -> None:
    model = build_model()
    report = measurements(model)
    result = validation(model, report)

    assert result["passed"], result["checks"]
    assert set(model.parts) == {"base", "lid"}
    assert report["assembly"]["solid_count"] == 2
    assert report["features"]["interference_volume_mm3"]["value"] == pytest.approx(0)


def test_parameter_change_regenerates_exact_dimensions() -> None:
    parameters = replace(
        ModelParameters(), width=120.0, depth=72.0, lid_clearance=0.75
    )
    report = measurements(build_model(parameters))

    assert report["assembly"]["bounding_box"]["size_mm"] == pytest.approx(
        [120.0, 72.0, parameters.base_height + 0.75 + parameters.lid_thickness]
    )
    assert report["features"]["lid_clearance_mm"]["measured_minimum"] == pytest.approx(
        0.75
    )


def test_exports_are_cad_first_and_stl_is_opt_in(tmp_path) -> None:
    model = build_model()
    export_model(model, tmp_path)

    assert (tmp_path / "enclosure.step").is_file()
    assert (tmp_path / "base.step").is_file()
    assert (tmp_path / "lid.step").is_file()
    assert not list(tmp_path.glob("*.stl"))
    assert not list(tmp_path.glob("*.3mf"))

    export_model(model, tmp_path, export_stl=True)
    assert (tmp_path / "base.stl").is_file()
    assert (tmp_path / "lid.stl").is_file()


@pytest.mark.parametrize(
    "parameters",
    [
        replace(ModelParameters(), wall=0),
        replace(ModelParameters(), lid_clearance=-0.1),
        replace(ModelParameters(), mounting_hole_inset=1.0),
    ],
)
def test_invalid_parameters_fail_early(parameters: ModelParameters) -> None:
    with pytest.raises(ValueError):
        build_model(parameters)
