#!/usr/bin/env python3
"""Tira capturas de tela de um app compilado (usado pelo workflow verificar-ui.yml).

    python3 capturas.py <vectorcraft|photocraft|figcraft> <checkout do app> <pasta de saída>

VectorCraft e FigCraft: abre o app (debug) num X virtual e usa o canal de controle (JSON por linha
em 127.0.0.1) para abrir as telas e chamar ui.screenshot. PhotoCraft: usa o exemplo "snapshot", que
desenha fora da tela. Cada falha é registrada em capturas.log, sem interromper as outras capturas.
"""

import json
import os
import socket
import subprocess
import sys
import time

APP, SRC, OUT = sys.argv[1], os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
TARGET = os.path.join(SRC, "target", "debug")
LOG = open(os.path.join(OUT, "capturas.log"), "a", encoding="utf-8")


def log(msg):
    print(msg, flush=True)
    LOG.write(msg + "\n")
    LOG.flush()


class Control:
    def __init__(self, port):
        deadline = time.time() + 180
        while True:
            try:
                self.sock = socket.create_connection(("127.0.0.1", port), timeout=60)
                break
            except OSError:
                if time.time() > deadline:
                    raise
                time.sleep(1)
        self.file = self.sock.makefile("rwb")
        self.next_id = 1

    def call(self, method, params=None):
        msg = {"id": self.next_id, "method": method, "params": params or {}}
        self.next_id += 1
        self.file.write((json.dumps(msg) + "\n").encode())
        self.file.flush()
        line = self.file.readline().decode(errors="replace").strip()
        log(f"  {method} {json.dumps(params or {})[:160]} -> {line[:300]}")
        return json.loads(line) if line else {}

    def shot(self, name, settle=1.5):
        time.sleep(settle)
        path = os.path.join(OUT, f"{name}.png")
        for _ in range(5):
            reply = self.call("ui.screenshot", {"path": path})
            if os.path.exists(path):
                return
            if "error" not in reply:
                time.sleep(1)
                if os.path.exists(path):
                    return
            time.sleep(1.5)
        log(f"  !! sem captura: {name}")


def run_windowed(binary, port, steps, env_extra, args=()):
    env = dict(os.environ, **env_extra)
    cmd = ["xvfb-run", "-a", "-s", "-screen 0 1600x1000x24", binary, "--control", str(port), *args]
    log("$ " + " ".join(cmd))
    proc = subprocess.Popen(cmd, cwd=SRC, env=env, stdout=open(os.path.join(OUT, "app.log"), "w"), stderr=subprocess.STDOUT)
    try:
        ctl = Control(port)
        steps(ctl)
    except Exception as exc:  # noqa: BLE001 - registra e segue
        log(f"!! {type(exc).__name__}: {exc}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()


def vectorcraft():
    def steps(c):
        c.call("ui.set", {"brightness": "mediumDark"})
        c.shot("1-inicio", settle=4)
        c.call("engine.execute", {"command": "file.newDialog"})
        c.shot("2-novo-documento")
        c.call("ui.dialog.set", {"field": "category", "value": "Print"})
        c.shot("3-novo-documento-print")
        c.call("ui.dialog.set", {"field": "advanced", "value": True})
        c.shot("4-novo-documento-avancado")
        c.call("ui.dialog.cancel")
        c.call("engine.execute", {"command": "file.new", "params": {}})
        for i in range(4):
            c.call("engine.execute", {"command": "shape.rectangle", "params": {"x": 120 + i * 260, "y": 160, "width": 200, "height": 140}})
        c.shot("5-janela-principal", settle=2)

    run_windowed(os.path.join(TARGET, "vectorcraft"), 7979, steps, {"VECTORCRAFT_NO_PREFS": "1"})


def figcraft():
    def steps(c):
        c.shot("1-inicio", settle=4)

    run_windowed(os.path.join(TARGET, "figcraft"), 7980, steps, {})


def filmcraft():
    data = os.path.join(OUT, "_dados")
    os.makedirs(data, exist_ok=True)

    def steps(c):
        c.shot("1-inicio", settle=5)
        c.call("engine.execute", {"command": "file.newProject", "params": {}})
        c.shot("2-novo-documento")
        c.call("ui.set", {"newProject": {"category": "cinema"}})
        c.shot("3-novo-documento-cinema")
        c.call("ui.set", {"newProject": {"advanced": True}})
        c.shot("4-novo-documento-avancado")
        c.call("ui.key", {"key": "Escape"})
        c.call("engine.execute", {"command": "file.newProject", "params": {"name": "Demo"}})
        c.shot("5-janela-principal", settle=2)

    binary = os.path.join(TARGET, "filmcraft")
    run_windowed(binary, 7981, steps, {"FILMCRAFT_DATA_DIR": data}, ["--no-recover"])


def photocraft():
    image = os.path.join(OUT, "_amostra.png")
    subprocess.run(["convert", "-size", "1600x1000", "gradient:#4a7ab8-#e8b04a", image], check=False)
    shots = [
        ("1-inicio", []),
        ("2-novo-documento", ["--script", json.dumps([["ui.menu.invoke", {"id": "file.new"}]])]),
        ("3-novo-documento-print", ["--script", json.dumps([["ui.menu.invoke", {"id": "file.new"}],
                                                           ["ui.dialog.set", {"field": "__category", "value": "Print"}]])]),
        ("4-novo-documento-avancado", ["--script", json.dumps([["ui.menu.invoke", {"id": "file.new"}],
                                                              ["ui.dialog.set", {"field": "__advanced", "value": True}]])]),
        ("5-janela-principal", ["--open", image]),
    ]
    for name, extra in shots:
        out = os.path.join(OUT, f"{name}.png")
        cmd = ["xvfb-run", "-a", "cargo", "run", "--locked", "-q", "-p", "photocraft-ui-egui", "--example", "snapshot", "--",
               "--out", out, "--size", "1440x900", "--scale", "1", *extra]
        log("$ " + " ".join(cmd))
        res = subprocess.run(cmd, cwd=SRC, capture_output=True, text=True, timeout=1800)
        log((res.stdout + res.stderr)[-2000:])
        if not os.path.exists(out):
            log(f"  !! sem captura: {name}")
    if os.path.exists(image):
        os.remove(image)


{"vectorcraft": vectorcraft, "photocraft": photocraft, "figcraft": figcraft, "filmcraft": filmcraft}[APP]()
