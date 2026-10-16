import json
import uuid
from pathlib import Path

from qt_compat import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QFileDialog, QMessageBox, QTabWidget, QInputDialog,
    QSettings, QStandardPaths, QLockFile, QTimer)
from main import App


class ClientTab(App):
    def __init__(self, owner, profile_id, name, directory):
        self.owner, self.profile_id, self.client_name = owner, profile_id, name
        self.queued = False
        self.embedded = True
        super().__init__(directory)
        self.choose.hide()
        self.folder.hide()
        self.setMinimumSize(700, 580)
        self.schema.editingFinished.connect(self.persist)
        self.version.editingFinished.connect(self.persist)

    def persist(self):
        self.settings.setValue('schema', self.schema.text().strip())
        self.settings.setValue('version', self.version.text().strip())
        self.settings.sync()

    def start(self, checked=False, resume=False, confirmed=False):
        if self.busy or self.queued or not self.send.isEnabled():
            return
        if resume:
            # A saved queue always retains its original folder and environment.
            self.restore_queue()
            if not self.resume_pending:
                return
        else:
            self.folder.setText(self.owner.folder.text())
        if self.resume_pending and not resume:
            if QMessageBox.question(self, 'Nova fila', 'Substituir a fila pausada deste cliente?') != QMessageBox.Yes:
                return
        if not self.send.isEnabled():
            return
        schema = self.schema.text().strip()
        if any(t is not self and (t.busy or t.queued) and t.schema.text().strip() == schema for t in self.owner.clients):
            QMessageBox.warning(self, 'Schema em uso', 'Já existe um envio ativo ou aguardando para esse schema.')
            return
        if sum(t.busy for t in self.owner.clients) >= 3:
            self.queued = True
            self.owner.pending.append((self, resume))
            self.set_waiting(True)
            self.status.setText('Aguardando uma vaga — até 3 clientes enviam ao mesmo tempo.')
        else:
            super().start(resume=resume, confirmed=True)
        self.owner.refresh()

    def set_waiting(self, waiting):
        for control in (self.key, self.schema, self.version, self.delay):
            control.setEnabled(not waiting)
        self.send.setEnabled(False)
        self.resume_button.setEnabled(False)
        self.cancel.setEnabled(waiting)
        self.pause_button.setEnabled(waiting)
        if not waiting:
            self.validate()

    def remove_waiting(self):
        self.owner.pending = [(tab, resume) for tab, resume in self.owner.pending if tab is not self]
        self.queued = False
        self.set_waiting(False)
        self.cancel.setEnabled(False)
        self.pause_button.setEnabled(False)
        self.status.setText('Retirado da espera. Clique em enviar quando quiser iniciar.')
        self.owner.refresh()

    def cancel_upload(self):
        if self.queued:
            self.remove_waiting()
        else:
            super().cancel_upload()

    def pause_upload(self):
        if self.queued:
            self.remove_waiting()
        else:
            super().pause_upload()

    def on_event(self, event):
        super().on_event(event)
        self.owner.refresh()

    def on_finished(self):
        super().on_finished()
        self.owner.refresh()
        QTimer.singleShot(0, self.owner.drain)


class MultiClient(QWidget):
    def __init__(self, data_dir=None):
        super().__init__()
        self.setWindowTitle('Uploader Convertize — Clientes')
        self.resize(950, 880)
        self.root = Path(data_dir or QStandardPaths.writableLocation(QStandardPaths.AppDataLocation))
        self.root.mkdir(parents=True, exist_ok=True)
        self.session_lock = QLockFile(str(self.root / 'clients-window.lock'))
        self.session_lock.setStaleLockTime(0)
        if not self.session_lock.tryLock(0):
            raise RuntimeError('O Uploader já está aberto. Use a janela existente.')
        self.prefs = QSettings(str(self.root / 'clients.ini'), QSettings.IniFormat)
        self.clients, self.pending = [], []
        self.closing = False
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        header = QLabel('Envio por cliente')
        header.setStyleSheet('font-size: 24px; font-weight: 600; color: #153650;')
        layout.addWidget(header)
        layout.addWidget(QLabel('Uma pasta compartilhada. Até 3 envios simultâneos. As chaves não são salvas.'))
        row = QHBoxLayout()
        self.folder = QLineEdit(str(self.prefs.value('folder', '')))
        self.folder.setReadOnly(True)
        self.folder.setPlaceholderText('Escolha a pasta compartilhada')
        self.choose = QPushButton('Escolher pasta…')
        self.choose.clicked.connect(self.select_folder)
        row.addWidget(self.folder, 1)
        row.addWidget(self.choose)
        layout.addLayout(row)
        actions = QHBoxLayout()
        self.add = QPushButton('Adicionar cliente')
        self.add.clicked.connect(self.add_client)
        self.rename = QPushButton('Renomear cliente')
        self.rename.clicked.connect(self.rename_client)
        self.all = QPushButton('Enviar clientes prontos')
        self.all.clicked.connect(self.send_ready)
        actions.addWidget(self.add)
        actions.addWidget(self.rename)
        actions.addWidget(self.all)
        layout.addLayout(actions)
        self.tabs = QTabWidget()
        self.tabs.setTabsClosable(True)
        self.tabs.tabCloseRequested.connect(self.remove_client)
        layout.addWidget(self.tabs, 1)
        self.summary = QLabel()
        layout.addWidget(self.summary)
        raw = self.prefs.value('profiles', '')
        profiles = json.loads(raw) if raw else [{'id': 'original', 'name': 'Cliente 1'}]
        for profile in profiles:
            self.create_tab(profile['id'], profile['name'])
        if self.clients:
            self.setStyleSheet(self.clients[0].styleSheet())
        if not self.folder.text() and self.clients:
            self.folder.setText(self.clients[0].folder.text())
        for tab in self.clients:
            if not tab.resume_pending:
                tab.folder.setText(self.folder.text())
        self.persist()
        self.refresh()

    def create_tab(self, profile_id, name):
        directory = self.root if profile_id == 'original' else self.root / 'clients' / profile_id
        tab = ClientTab(self, profile_id, name, directory)
        self.clients.append(tab)
        self.tabs.addTab(tab, name)
        if not tab.resume_pending:
            tab.folder.setText(self.folder.text())
        return tab

    def persist(self):
        self.prefs.setValue('profiles', json.dumps([{'id': t.profile_id, 'name': t.client_name} for t in self.clients]))
        self.prefs.setValue('folder', self.folder.text())
        self.prefs.sync()

    def add_client(self):
        name, ok = QInputDialog.getText(self, 'Adicionar cliente', 'Nome do cliente:')
        if ok and name.strip():
            tab = self.create_tab(uuid.uuid4().hex, name.strip())
            self.tabs.setCurrentWidget(tab)
            self.persist()

    def rename_client(self):
        tab = self.tabs.currentWidget()
        if tab:
            name, ok = QInputDialog.getText(self, 'Renomear cliente', 'Nome:', text=tab.client_name)
            if ok and name.strip():
                tab.client_name = name.strip()
                self.persist()
                self.refresh()

    def remove_client(self, index):
        tab = self.tabs.widget(index)
        if tab.busy or tab.queued or tab.resume_pending:
            QMessageBox.information(self, 'Cliente com fila', 'Conclua ou cancele o envio antes de remover esta aba.')
            return
        if len(self.clients) == 1:
            return
        if QMessageBox.question(self, 'Remover cliente', 'Remover esta aba? O histórico continuará guardado localmente.') == QMessageBox.Yes:
            self.tabs.removeTab(index)
            self.clients.remove(tab)
            tab.key.clear()
            tab.deleteLater()
            self.persist()

    def select_folder(self):
        folder = QFileDialog.getExistingDirectory(self, 'Pasta compartilhada', self.folder.text())
        if folder:
            self.folder.setText(folder)
            for tab in self.clients:
                if not tab.resume_pending:
                    tab.folder.setText(folder)
            self.persist()

    def send_ready(self):
        for tab in self.clients:
            if tab.send.isEnabled():
                tab.start(resume=tab.resume_pending)

    def refresh(self):
        active = sum(t.busy for t in self.clients)
        waiting = sum(t.queued for t in self.clients)
        self.summary.setText(f'{active} cliente(s) ativo(s) • {waiting} aguardando')
        self.choose.setEnabled(not active and not waiting)
        for tab in self.clients:
            done = 'Com erros' if any(r['status'] == 'Erro' for r in tab.rows) else ('Concluído' if tab.rows else 'Pronto')
            label = 'Aguardando' if tab.queued else ('Enviando' if tab.busy else ('Pausado' if tab.resume_pending else done))
            self.tabs.setTabText(self.tabs.indexOf(tab), f'{tab.client_name} — {label}')

    def drain(self):
        if self.closing:
            return
        while self.pending and sum(t.busy for t in self.clients) < 3:
            tab, resume = self.pending.pop(0)
            tab.queued = False
            tab.set_waiting(False)
            App.start(tab, resume=resume, confirmed=True)
        self.refresh()

    def closeEvent(self, event):
        if any(t.busy for t in self.clients):
            self.closing = True
            for tab in self.clients:
                tab.pause_upload()
            QMessageBox.information(self, 'Pausando clientes', 'Aguarde a confirmação de pausa dos clientes ativos e feche novamente. Clientes aguardando não foram iniciados.')
            event.ignore()
            # The user may decide to keep the application open after pausing.
            self.closing = False
        else:
            for tab in self.clients:
                if tab.queued:
                    tab.remove_waiting()
                tab.persist()
                tab.key.clear()
            self.persist()
            self.session_lock.unlock()
            event.accept()
