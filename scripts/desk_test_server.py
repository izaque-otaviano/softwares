"""Servidor de teste: recebe o POST multipart do Recorte e mostra o que chegou (sem o módulo cgi)."""
import http.server, json, re

class H(http.server.BaseHTTPRequestHandler):
    def handle_upload(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        ctype = self.headers.get("Content-Type", "")
        info = {"metodo": self.command, "caminho": self.path, "tipo": ctype.split(";")[0],
                "token_em": [h for h in ("Authorization", "X-Token") if self.headers.get(h)]}
        if ctype.startswith("application/json"):
            for k, v in json.loads(body).items():
                info[k] = v if len(str(v)) < 80 else f"({len(str(v))} caracteres)"
        elif "boundary=" in ctype:
            boundary = re.search(r"boundary=(\S+)", ctype).group(1).encode()
            for part in body.split(b"--" + boundary):
                if b"\r\n\r\n" not in part:
                    continue
                head, data = part.split(b"\r\n\r\n", 1)
                data = data[:-2] if data.endswith(b"\r\n") else data
                name = re.search(rb'name="([^"]+)"', head)
                if not name:
                    continue
                fname = re.search(rb'filename="([^"]+)"', head)
                info[name.group(1).decode()] = (f"{fname.group(1).decode()} ({len(data)} bytes)" if fname
                                                else data.decode("utf-8", "replace")[:100])
        else:
            info["corpo"] = f"{len(body)} bytes"
        print("RECEBIDO:", json.dumps(info, ensure_ascii=False), flush=True)
        self.send_response(201); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(b'{"ok":true,"data":{"link":"https://desk.exemplo/capturas/123"}}')
    do_POST = handle_upload
    do_PUT = handle_upload
    def log_message(self, *a): pass

http.server.HTTPServer(("127.0.0.1", 8765), H).serve_forever()
