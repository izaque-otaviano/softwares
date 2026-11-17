"""Servidor de teste: recebe o POST multipart do Recorte e mostra o que chegou."""
import cgi, http.server, json, sys

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        ctype, pdict = cgi.parse_header(self.headers.get("Content-Type", ""))
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers,
                                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers["Content-Type"]})
        info = {"caminho": self.path, "autorizacao": self.headers.get("Authorization", "")[:20]}
        for k in form.keys():
            item = form[k]
            if item.filename:
                data = item.file.read()
                info[k] = f"{item.filename} ({item.type}, {len(data)} bytes)"
            else:
                info[k] = item.value[:120]
        print("RECEBIDO:", json.dumps(info, ensure_ascii=False), flush=True)
        self.send_response(201); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *a): pass

http.server.HTTPServer(("127.0.0.1", 8765), H).serve_forever()
