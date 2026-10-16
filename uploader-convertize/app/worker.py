import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path

from client import APIError


def parse_name(path):
    match = re.fullmatch(r"(\d{8,14})(?:_(\d+)| \((\d+)\))?", path.stem)
    if not match:
        raise ValueError("Nome inválido. Use EAN.jpg, EAN_1.jpg ou EAN (1).jpg; EAN com 8 a 14 dígitos.")
    return match[1], int(match[2] or match[3] or 0)


class Cancelled(Exception):
    pass


class Engine:
    def __init__(self, client, db_path, emit, cancelled, delay=0, paused=lambda: False, job_path=None, resume=False):
        self.client, self.db_path, self.emit = client, Path(db_path), emit
        self.cancelled, self.delay = cancelled, delay
        self.paused, self.resume = paused, resume
        self.job_path = Path(job_path) if job_path else None

    def check(self):
        if self.cancelled():
            raise Cancelled()

    def save(self, db, destination=None):
        destination = Path(destination or self.db_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        name = None
        try:
            with tempfile.NamedTemporaryFile("w", dir=destination.parent, delete=False, encoding="utf-8") as f:
                name = f.name
                json.dump(db, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(name, destination)
        finally:
            if name and os.path.exists(name):
                os.unlink(name)

    def run(self, folder):
        results, files = [], []
        try:
            self.check()
            root = Path(folder)
            if not root.is_dir():
                raise ValueError("Selecione uma pasta existente.")
            def walk_error(error):
                raise error
            if self.resume and self.job_path:
                job = json.loads(self.job_path.read_text(encoding='utf-8'))
                if job['schema'] != self.client.schema or job['version'] != self.client.version or job['folder'] != str(root):
                    raise ValueError('Use a mesma pasta, schema e versão para continuar a fila salva.')
                files = [root / name for name in job['files']]
                results = job['results']
            else:
                for directory, _, names in os.walk(root, onerror=walk_error):
                    self.check()
                    files.extend(Path(directory) / n for n in sorted(names)
                                 if Path(n).suffix.lower() in (".jpg", ".jpeg", ".png"))
            def checkpoint(state):
                if self.job_path:
                    self.save({'schema': self.client.schema, 'version': self.client.version,
                        'folder': str(root), 'files': [str(p.relative_to(root)) for p in files],
                        'results': results, 'state': state}, self.job_path)
            checkpoint('running')
            self.emit({"type": "total", "total": len(files)})
            for i, result in enumerate(results):
                self.emit({'type': 'result', **result, 'done': i + 1, 'total': len(files)})
            if not files:
                return {"results": [], "total": 0, "cancelled": False}
            try:
                db = json.loads(self.db_path.read_text()) if self.db_path.exists() else {}
                if not isinstance(db, dict):
                    raise ValueError()
            except (ValueError, OSError):
                raise ValueError("Não foi possível ler o histórico. Contate o suporte; nenhum envio foi iniciado.") from None
            scope = f"v2:{self.client.schema}:{self.client.version}"
            for index, path in enumerate(files):
                if index < len(results):
                    continue
                self.check()
                if self.paused():
                    checkpoint('paused')
                    return {'results': results, 'total': len(files), 'paused': True}
                relative = str(path.relative_to(root))
                self.emit({"type": "current", "file": relative, "phase": "Verificando arquivo"})
                status, message = "Erro", ""
                try:
                    ean, position = parse_name(path)
                    digest = hashlib.sha256()
                    with path.open("rb") as stream:
                        while chunk := stream.read(1024 * 1024):
                            self.check()
                            digest.update(chunk)
                    if path.stat().st_size == 0:
                        raise ValueError("Arquivo vazio.")
                    key = f"{scope}:{ean}:{position}:{digest.hexdigest()}"
                    if key in db:
                        status, message = "Já processada", "Confirmada anteriormente neste ambiente e versão."
                    else:
                        self.check()
                        self.emit({"type": "current", "file": relative, "phase": "Consultando produto"})
                        sku = self.client.get("/skus/", {"ean_13": ean})
                        if not isinstance(sku, dict) or not isinstance(sku.get("results"), list) or "count" not in sku:
                            raise APIError("Resposta de produtos inválida.")
                        if sku.get("next"):
                            raise APIError("Consulta retornou múltiplas páginas. Contate o suporte para conferir os produtos.")
                        products = list(dict.fromkeys(item["product"] for item in sku["results"]))
                        if not products:
                            status, message = "Ignorada", f"EAN {ean} não encontrado. Pode ser tentado novamente."
                        else:
                            uploaded = 0
                            for product in products:
                                self.check()
                                self.emit({"type": "current", "file": relative, "phase": "Consultando imagens existentes"})
                                existing = self.client.get("/images/", {"product_id": product, "position": position, "version": "2"})
                                if not isinstance(existing, dict) or not isinstance(existing.get("count"), int):
                                    raise APIError("Resposta da consulta de imagens inválida.")
                                if existing["count"] == 0:
                                    self.check()
                                    self.emit({"type": "current", "file": relative, "phase": "Enviando imagem — aguardando confirmação"})
                                    with path.open("rb") as stream:
                                        self.client.post("/images/", data={"position": position, "product": product}, files={"image": (path.name, stream)})
                                    uploaded += 1
                            db[key] = {"status": "confirmed", "timestamp": time.time()}
                            self.save(db)
                            status = "Enviada" if uploaded else "Já existente"
                            message = f"Confirmada em {len(products)} produto(s); {uploaded} envio(s)."
                except (APIError, ValueError, OSError, KeyError, TypeError) as exc:
                    message = str(exc) or "Resposta inesperada. Contate o suporte."
                result = {"file": relative, "status": status, "message": message}
                results.append(result)
                checkpoint('running')
                self.emit({"type": "result", **result, "done": index + 1, "total": len(files)})
                deadline = time.monotonic() + self.delay
                while time.monotonic() < deadline:
                    self.check()
                    if self.paused():
                        break
                    time.sleep(min(.1, max(0, deadline - time.monotonic())))
            checkpoint('completed')
            return {"results": results, "total": len(files), "cancelled": False}
        except Cancelled:
            if 'checkpoint' in locals():
                checkpoint('cancelled')
            return {"results": results, "total": len(files), "cancelled": True}
