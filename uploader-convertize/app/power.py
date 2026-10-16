"""Scoped idle-sleep inhibition; no persistent system settings."""
import ctypes
import shutil
import subprocess
import sys
import os


class Awake:
    def __init__(self):
        self.process = None
        self.windows = False

    def start(self):
        if sys.platform == 'win32':
            if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000001):
                raise RuntimeError('Windows não confirmou o bloqueio de suspensão.')
            self.windows = True
        elif sys.platform == 'darwin':
            self.process = subprocess.Popen(['/usr/bin/caffeinate', '-i', '-w', str(os.getpid())], stdin=subprocess.DEVNULL,
                                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            command = shutil.which('systemd-inhibit')
            if not command:
                raise RuntimeError('Instale systemd-inhibit ou desative a suspensão manualmente durante o envio.')
            self.process = subprocess.Popen([command, '--what=sleep:idle', '--mode=block',
                '--who=Uploader Convertize', '--why=Envio de imagens', 'cat'], stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if self.process:
            try:
                self.process.wait(timeout=.2)
            except subprocess.TimeoutExpired:
                return
            raise RuntimeError('O sistema não permitiu impedir a suspensão. Ajuste a energia manualmente.')

    def close(self):
        if self.windows:
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
            self.windows = False
        if self.process:
            self.process.terminate()
            self.process.wait()
            if self.process.stdin:
                self.process.stdin.close()
            self.process = None
