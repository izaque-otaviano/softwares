import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from worker import Engine, parse_name
from client import APIClient, APIError


class FakeClient:
    schema, version = 'demo', '1.0'
    def __init__(self):
        self.uploads = 0
        self.error = False
        self.missing = False
        self.existing = False
    def get(self, path, params):
        if self.error:
            raise APIError('Falha de conexão')
        if path == '/skus/':
            return {'count': 0 if self.missing else 1, 'results': [] if self.missing else [{'product': 10}]}
        return {'count': int(self.existing)}
    def post(self, *args, **kwargs):
        self.uploads += 1
        return {'id': 20}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.folder = self.root / 'images'
        self.folder.mkdir()
        (self.folder / '7891234567890_1.jpg').write_bytes(b'image-test')
        self.client = FakeClient()
        self.events = []
    def tearDown(self):
        self.tmp.cleanup()
    def run_engine(self, cancelled=lambda: False):
        return Engine(self.client, self.root / 'db.json', self.events.append, cancelled).run(self.folder)
    def test_success_and_dedup(self):
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Enviada')
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Já processada')
        self.assertEqual(self.client.uploads, 1)
        self.client.version = '2.0'
        self.run_engine()
        self.assertEqual(self.client.uploads, 2)
    def test_error_is_retryable(self):
        self.client.error = True
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Erro')
        self.client.error = False
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Enviada')
    def test_missing_is_retryable(self):
        self.client.missing = True
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Ignorada')
        self.client.missing = False
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Enviada')
    def test_existing(self):
        self.client.existing = True
        self.assertEqual(self.run_engine()['results'][0]['status'], 'Já existente')
        self.assertEqual(self.client.uploads, 0)
    def test_cancel_between_files(self):
        (self.folder / '7891234567890_2.jpg').write_bytes(b'another')
        result = self.run_engine(lambda: self.client.uploads > 0)
        self.assertTrue(result['cancelled'])
        self.assertEqual(len(result['results']), 1)
    def test_empty_and_invalid(self):
        (self.folder / 'invalid.jpg').write_bytes(b'bad')
        (self.folder / '7891234567890_2.png').touch()
        statuses = [x['status'] for x in self.run_engine()['results']]
        self.assertEqual(statuses.count('Erro'), 2)
    def test_corrupt_history_blocks_upload(self):
        (self.root / 'db.json').write_text('invalid')
        with self.assertRaises(ValueError):
            self.run_engine()
        self.assertEqual(self.client.uploads, 0)
    def test_names(self):
        self.assertEqual(parse_name(Path('7891234567890 (2).jpg')), ('7891234567890', 2))
        with self.assertRaises(ValueError):
            parse_name(Path('7891234567890_1_extra.jpg'))

    def test_pause_and_resume_new_engine(self):
        (self.folder / '7891234567890_2.jpg').write_bytes(b'other')
        job = self.root / 'queue.json'
        first = Engine(self.client, self.root / 'db.json', self.events.append, lambda: False,
                       paused=lambda: self.client.uploads == 1, job_path=job).run(self.folder)
        self.assertTrue(first['paused'])
        self.assertEqual(len(first['results']), 1)
        second = Engine(self.client, self.root / 'db.json', self.events.append, lambda: False,
                        job_path=job, resume=True).run(self.folder)
        self.assertEqual(len(second['results']), 2)
        self.assertEqual(self.client.uploads, 2)

    def test_resume_rejects_wrong_environment(self):
        job = self.root / 'queue.json'
        Engine(self.client, self.root / 'db.json', self.events.append, lambda: False,
               paused=lambda: True, job_path=job).run(self.folder)
        self.client.schema = 'different'
        with self.assertRaises(ValueError):
            Engine(self.client, self.root / 'db.json', self.events.append, lambda: False,
                   job_path=job, resume=True).run(self.folder)
        self.assertEqual(self.client.uploads, 0)


class ClientTests(unittest.TestCase):
    def test_get_after_post_has_no_upload_data(self):
        client = APIClient('demo', 'secret')
        client.session = Mock()
        client.session.request.return_value = Mock(ok=True, content=b'{}', json=lambda: {})
        client.post('/images/', data={'product': 1}, files={'image': 'test'})
        client.get('/skus/', {'ean_13': '12345678'})
        kwargs = client.session.request.call_args.kwargs
        self.assertNotIn('files', kwargs)
        self.assertNotIn('data', kwargs)
        self.assertNotIn('verify', kwargs)
    def test_unauthorized(self):
        client = APIClient('demo', 'secret')
        client.session = Mock()
        client.session.request.return_value = Mock(ok=False, status_code=401)
        with self.assertRaisesRegex(APIError, 'inválida'):
            client.get('/skus/')


if __name__ == '__main__':
    unittest.main()
