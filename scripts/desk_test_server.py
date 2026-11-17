"""Servidor de teste: recebe o POST multipart do Recorte e mostra o que chegou (sem o módulo cgi)."""
import http.server, json, re

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        boundary = re.search(r"boundary=(\S+)", self.headers.get("Content-Type", "")).group(1).encode()
        info = {"caminho": self.path, "autorizacao": self.headers.get("Authorization", "")[:20]}
        for part in body.split(b"--" + boundary):
            if b"\r\n\r\n" not in part:
                continue
            head, data = part.split(b"\r\n\r\n", 1)
            data = data[:-2] if data.endswith(b"\r\n") else data
            name = re.search(rb'name="([^"]+)"', head)
            if not name:
                continue
            fname = re.search(rb'filename="([^"]+)"', head)
            key = name.group(1).decode()
            info[key] = (f"{fname.group(1).decode()} ({len(data)} bytes)" if fname
                         else data.decode("utf-8", "replace")[:100])
        print("RECEBIDO:", json.dumps(info, ensure_ascii=False), flush=True)
        self.send_response(201); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *a): pass

http.server.HTTPServer(("127.0.0.1", 8765), H).serve_forever()
