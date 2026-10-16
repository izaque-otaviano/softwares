import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from qt_compat import QApplication
from main import App
app = QApplication([])
with tempfile.TemporaryDirectory() as folder:
    window = App(Path(folder) / 'settings')
    window.show()
    app.processEvents()
    assert not window.send.isEnabled()
    window.key.setText('test-only')
    window.schema.setText('demo')
    window.folder.setText(folder)
    assert window.send.isEnabled()
    window.on_event({'type': 'result', 'file': 'sample.jpg', 'status': 'Enviada',
                     'message': 'Simulated', 'done': 1, 'total': 1})
    assert window.table.item(0, 0).background().color().name() == '#d8efdf'
    window.close()
print('GUI startup, input validation and green row OK')
