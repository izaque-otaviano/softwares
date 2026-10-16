import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import sys
import time
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from qt_compat import QApplication
from tabs import MultiClient
import main

APP = QApplication.instance() or QApplication([])


def pump(predicate, seconds=8):
    end = time.monotonic() + seconds
    while not predicate() and time.monotonic() < end:
        APP.processEvents()
        time.sleep(.01)
    APP.processEvents()
    assert predicate(), 'GUI operation timed out'


class FakeClient:
    gates, uploads, credentials = {}, [], []
    def __init__(self, schema, key, version):
        self.schema, self.version = schema, version
        self.credentials.append((schema, key))
    def get(self, path, params=None):
        return {'count': 1, 'results': [{'product': self.schema}]} if path == '/skus/' else {'count': 0}
    def post(self, path, data=None, files=None):
        if not self.gates[self.schema].wait(6):
            raise ValueError('Simulated gate timed out')
        self.uploads.append((self.schema, files['image'][0]))
        return {'id': 1}
    def close(self):
        pass


class TabsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.images = self.root / 'images'
        self.images.mkdir()
        for i in (1, 2):
            (self.images / f'7891234567890_{i}.jpg').write_bytes(b'image')
        FakeClient.gates, FakeClient.uploads, FakeClient.credentials = {}, [], []
        self.patches = [patch.object(main, 'APIClient', FakeClient), patch.object(main, 'Awake'),
                        patch.object(main.QMessageBox, 'warning'), patch.object(main.QMessageBox, 'information')]
        for p in self.patches:
            p.start()
        self.window = MultiClient(self.root / 'data')
        self.window.folder.setText(str(self.images))
        self.configure(self.window.clients[0], 'client0')
    def configure(self, tab, schema):
        tab.schema.setText(schema)
        tab.key.setText('SECRET-' + schema)
        tab.folder.setText(str(self.images))
        FakeClient.gates[schema] = threading.Event()
    def tearDown(self):
        for gate in FakeClient.gates.values():
            gate.set()
        pump(lambda: not any(t.busy for t in self.window.clients))
        self.window.close()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()
    def test_parallel_limit_queue_and_isolation(self):
        for i in range(1, 4):
            self.configure(self.window.create_tab(f'id{i}', f'Cliente {i}'), f'client{i}')
        self.window.send_ready()
        self.assertEqual(sum(t.busy for t in self.window.clients), 3)
        self.assertTrue(self.window.clients[3].queued)
        FakeClient.gates['client0'].set()
        pump(lambda: self.window.clients[3].busy)
        for gate in FakeClient.gates.values():
            gate.set()
        pump(lambda: not any(t.busy for t in self.window.clients))
        self.assertEqual(len(FakeClient.uploads), 8)
        for i, tab in enumerate(self.window.clients):
            self.assertEqual(len(tab.rows), 2)
            self.assertTrue(all(r['status'] == 'Enviada' for r in tab.rows))
            db = (tab.data_dir / 'processed_files_v2.json').read_text()
            self.assertIn('client' + str(i), db)
        self.window.close()
        for path in (self.root / 'data').rglob('*'):
            if path.is_file():
                self.assertNotIn(b'SECRET-', path.read_bytes())
    def test_pause_one_client_and_reopen(self):
        second = self.window.create_tab('second', 'Segundo')
        self.configure(second, 'client1')
        self.window.send_ready()
        first = self.window.clients[0]
        first.pause_upload()
        FakeClient.gates['client0'].set()
        pump(lambda: not first.busy)
        self.assertTrue(first.resume_pending)
        self.assertTrue(second.busy)
        FakeClient.gates['client1'].set()
        pump(lambda: not second.busy)
        self.window.close()
        self.window = MultiClient(self.root / 'data')
        first = self.window.clients[0]
        self.assertEqual(first.key.text(), '')
        self.assertTrue(first.resume_pending)
        first.key.setText('SECRET-client0')
        first.resume_upload()
        pump(lambda: not first.busy)
        self.assertEqual(len(first.rows), 2)
    def test_duplicate_schema_rejected(self):
        second = self.window.create_tab('second', 'Segundo')
        self.configure(second, 'client0')
        self.window.clients[0].start()
        second.start()
        self.assertFalse(second.busy)
        self.assertFalse(second.queued)
        FakeClient.gates['client0'].set()


if __name__ == '__main__':
    unittest.main()
