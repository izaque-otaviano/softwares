"""Separate entry point so older PyInstaller versions package main as a module."""
import sys
import traceback
from pathlib import Path

try:
    from main import run
    run()
except Exception:
    if '--smoke-test' in sys.argv:
        Path('smoke-error.txt').write_text(traceback.format_exc(), encoding='utf-8')
        sys.exit(1)
    raise
