from pathlib import Path
import sys
import platform
root = Path(SPECPATH)
a = Analysis([str(root / 'app/main.py')], pathex=[str(root / 'app')],
             binaries=[], datas=[], hiddenimports=[], hookspath=[], hooksconfig={}, runtime_hooks=[],
             excludes=['PySide6.QtWebEngineCore', 'PySide6.QtQml', 'PySide6.QtQuick'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Uploader Convertize',
          console=False, debug=False, strip=False, upx=False,
          target_arch=platform.machine() if sys.platform == 'darwin' else None)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Uploader Convertize')
if sys.platform == 'darwin':
    app = BUNDLE(coll, name='Uploader Convertize.app', bundle_identifier='br.com.convertize.uploader',
                 version='2.2.0', info_plist={'CFBundleDisplayName': 'Uploader Convertize',
                  'NSHighResolutionCapable': True, 'LSMinimumSystemVersion': '13.0'})
