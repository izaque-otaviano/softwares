"""FreeCAD GUI macro: save standard PNG views of an exported STEP file."""

from __future__ import annotations

import os
import time
from pathlib import Path

import FreeCAD as App
import FreeCADGui as Gui
import Import


step_path = Path(os.environ["CODEX_CAD_STEP"]).resolve()
output_dir = Path(os.environ["CODEX_CAD_OUTPUT"]).resolve()
output_dir.mkdir(parents=True, exist_ok=True)

Import.open(str(step_path))
document = App.ActiveDocument
if document is None:
    raise RuntimeError(f"FreeCAD did not open {step_path}")

document.recompute()
view = Gui.activeDocument().activeView()
view.setAnimationEnabled(False)
view.setCameraType("Orthographic")
views = {
    "isometric": view.viewIsometric,
    "front": view.viewFront,
    "top": view.viewTop,
    "right": view.viewRight,
}
for name, select_view in views.items():
    select_view()
    Gui.updateGui()
    view.fitAll()
    Gui.updateGui()
    time.sleep(0.25)
    view.saveImage(str(output_dir / f"{name}.png"), 1200, 900, "Current")
    Gui.updateGui()
    time.sleep(0.25)

App.closeDocument(document.Name)
Gui.getMainWindow().close()
