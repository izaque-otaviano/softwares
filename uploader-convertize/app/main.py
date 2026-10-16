import re
import json
import tempfile
import sys
import threading
from collections import Counter
from pathlib import Path

from qt_compat import QThread, Signal, QSettings, QStandardPaths, QLockFile, QColor, QTimer
from qt_compat import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QFormLayout, QLabel, QLineEdit, QPushButton, QFileDialog, QMessageBox,
    QProgressBar, QTableWidget, QTableWidgetItem, QHeaderView, QDoubleSpinBox)

from client import APIClient
from worker import Engine
from power import Awake


class UploadThread(QThread):
    event = Signal(dict)
    completed = Signal(dict)

    def __init__(self, schema, key, version, folder, db_path, delay, resume=False):
        super().__init__()
        self.args = schema, key, version, folder, db_path, delay
        self.stop = threading.Event()
        self.rows = []
        self.pause = threading.Event()
        self.resume = resume

    def forward(self, event):
        if event['type'] == 'result':
            self.rows.append(event)
        self.event.emit(event)

    def run(self):
        schema, key, version, folder, db_path, delay = self.args
        self.args = None
        client = APIClient(schema, key, version)
        awake = Awake()
        try:
            try:
                awake.start()
            except Exception as exc:
                self.event.emit({'type': 'power_warning', 'message': str(exc)})
            result = Engine(client, db_path, self.forward, self.stop.is_set, delay,
                self.pause.is_set, Path(db_path).parent / 'queue.json', self.resume).run(folder)
        except Exception as exc:
            result = {'results': self.rows, 'fatal': str(exc), 'cancelled': False}
        finally:
            client.close()
            awake.close()
        self.completed.emit(result)


class App(QWidget):
    def __init__(self, data_dir=None):
        super().__init__()
        self.setWindowTitle('Uploader Convertize')
        self.resize(860, 740)
        self.setMinimumSize(720, 640)
        self.data_dir = Path(data_dir or QStandardPaths.writableLocation(QStandardPaths.AppDataLocation))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.settings = QSettings(str(self.data_dir / 'preferences.ini'), QSettings.IniFormat)
        self.thread = None
        self.busy = False
        self.rows = []
        self.resume_pending = False
        self.lock = QLockFile(str(self.data_dir / 'upload.lock'))
        self.lock.setStaleLockTime(0)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)
        title = QLabel('Imagens do catálogo')
        title.setStyleSheet('font-size: 25px; font-weight: 600; color: #153650;')
        layout.addWidget(title)
        subtitle = QLabel('Configure o acesso deste cliente e acompanhe seus resultados.' if getattr(self, 'embedded', False)
                          else 'Selecione uma pasta e acompanhe o envio para a Convertize.')
        layout.addWidget(subtitle)
        form = QFormLayout()
        form.setSpacing(10)
        self.key = QLineEdit()
        self.key.setEchoMode(QLineEdit.Password)
        self.key.setPlaceholderText('Cole sua chave de API — ela não será salva')
        self.schema = QLineEdit(self.settings.value('schema', ''))
        self.schema.setPlaceholderText('Nome do ambiente da loja')
        self.version = QLineEdit(self.settings.value('version', '1.0'))
        self.delay = QDoubleSpinBox()
        self.delay.setRange(0, 30)
        self.delay.setSuffix(' s entre imagens')
        self.delay.setValue(float(self.settings.value('delay', 0)))
        form.addRow('Chave de API', self.key)
        form.addRow('Schema da loja', self.schema)
        form.addRow('Versão da API', self.version)
        form.addRow('Intervalo opcional', self.delay)
        layout.addLayout(form)
        folder_row = QHBoxLayout()
        self.folder = QLineEdit(self.settings.value('folder', ''))
        self.folder.setReadOnly(True)
        self.folder.setPlaceholderText('Nenhuma pasta selecionada')
        self.choose = QPushButton('Escolher pasta…')
        self.choose.clicked.connect(self.select_folder)
        folder_row.addWidget(self.folder, 1)
        folder_row.addWidget(self.choose)
        layout.addLayout(folder_row)
        hint = QLabel('JPG e PNG, incluindo subpastas. Nomes: EAN.jpg, EAN_1.jpg ou EAN (1).jpg.')
        hint.setWordWrap(True)
        layout.addWidget(hint)
        buttons = QHBoxLayout()
        self.send = QPushButton('Enviar imagens')
        self.send.setObjectName('primary')
        self.send.clicked.connect(self.start)
        self.cancel = QPushButton('Cancelar envio')
        self.cancel.setEnabled(False)
        self.cancel.clicked.connect(self.cancel_upload)
        self.pause_button = QPushButton('Pausar envio')
        self.pause_button.setEnabled(False)
        self.pause_button.clicked.connect(self.pause_upload)
        self.resume_button = QPushButton('Continuar fila salva')
        self.resume_button.clicked.connect(self.resume_upload)
        buttons.addWidget(self.send)
        buttons.addWidget(self.cancel)
        buttons.addWidget(self.pause_button)
        buttons.addWidget(self.resume_button)
        buttons.addStretch()
        layout.addLayout(buttons)
        self.status = QLabel('Pronto para começar')
        self.status.setWordWrap(True)
        layout.addWidget(self.status)
        self.progress = QProgressBar()
        self.progress.setValue(0)
        self.progress.setFormat('Nenhum envio iniciado')
        layout.addWidget(self.progress)
        self.activity = QProgressBar()
        self.activity.setRange(0, 0)
        self.activity.setFixedHeight(4)
        self.activity.setTextVisible(False)
        self.activity.hide()
        layout.addWidget(self.activity)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(['Arquivo', 'Resultado', 'Detalhes'])
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.verticalHeader().hide()
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Interactive)
        self.table.setColumnWidth(0, 200)
        self.table.setColumnWidth(1, 130)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        layout.addWidget(self.table, 1)
        report = QHBoxLayout()
        self.copy = QPushButton('Copiar relatório')
        self.save = QPushButton('Salvar relatório…')
        self.copy.clicked.connect(lambda: QApplication.clipboard().setText(self.report()))
        self.save.clicked.connect(self.save_report)
        self.copy.setEnabled(False)
        self.save.setEnabled(False)
        report.addWidget(self.copy)
        report.addWidget(self.save)
        report.addStretch()
        layout.addLayout(report)
        self.setStyleSheet('''
            QWidget { background: #f5f8fb; color: #243747; font-size: 13px; }
            QLineEdit, QDoubleSpinBox { background: white; border: 1px solid #b7c7d5; border-radius: 5px; padding: 7px; }
            QPushButton { padding: 9px 15px; border: 1px solid #afc1d0; border-radius: 6px; background: #ffffff; }
            QPushButton#primary { background: #17689b; color: white; border-color: #17689b; font-weight: 600; }
            QPushButton:disabled { background: #e5ebf0; color: #778794; border-color: #d3dde6; }
            QPushButton:focus, QLineEdit:focus { border: 2px solid #17689b; }
            QProgressBar { border: 1px solid #c6d5e0; border-radius: 4px; min-height: 20px; text-align: center; background: white; }
            QProgressBar::chunk { background: #72bada; }
            QTableWidget { background: white; gridline-color: #e1e8ee; border: 1px solid #c6d5e0; }
            QHeaderView::section { background: #e8eff5; padding: 7px; border: none; }
        ''')
        for field in (self.key, self.schema, self.version, self.folder):
            field.textChanged.connect(self.validate)
        self.validate()
        self.restore_queue()

    def restore_queue(self):
        self.resume_pending = False
        try:
            job = json.loads((self.data_dir / 'queue.json').read_text(encoding='utf-8'))
            if job['state'] in ('running', 'paused') and len(job['results']) < len(job['files']):
                self.resume_pending = True
                self.schema.setText(job['schema'])
                self.version.setText(job['version'])
                self.folder.setText(job['folder'])
                self.status.setText(f"Fila salva: {len(job['results'])} de {len(job['files'])} concluídos. Cole a chave e clique em Continuar fila salva.")
        except FileNotFoundError:
            pass
        except (ValueError, KeyError, TypeError, OSError):
            self.status.setText('Não foi possível ler a fila salva. Contate o suporte antes de iniciar outra fila.')
        self.validate()

    def resume_upload(self):
        self.start(resume=True)

    def pause_upload(self):
        if self.thread and self.busy:
            self.thread.pause.set()
            self.pause_button.setEnabled(False)
            self.status.setText('Pausando… Aguardando concluir o arquivo atual. Depois você poderá fechar o aplicativo.')

    def validate(self):
        self.send.setEnabled(not self.busy and bool(self.key.text().strip()) and
            bool(re.fullmatch(r'[A-Za-z0-9_-]+', self.schema.text().strip())) and
            bool(re.fullmatch(r'\d+(?:\.\d+)*', self.version.text().strip())) and Path(self.folder.text()).is_dir() and bool(self.folder.text()))
        self.resume_button.setEnabled(self.resume_pending and self.send.isEnabled())

    def select_folder(self):
        folder = QFileDialog.getExistingDirectory(self, 'Escolha a pasta com imagens', self.folder.text())
        if folder:
            self.folder.setText(folder)

    def start(self, checked=False, resume=False, confirmed=False):
        if self.busy or not self.send.isEnabled():
            return
        if self.resume_pending and not resume and not confirmed:
            if QMessageBox.question(self, 'Iniciar outra fila?', 'Existe uma fila salva. Substituir a fila pendente por um novo envio?') != QMessageBox.Yes:
                return
        if not self.lock.tryLock(0):
            QMessageBox.warning(self, 'Envio em andamento', 'Outra janela está enviando imagens. Aguarde a conclusão.')
            return
        self.busy = True
        self.rows = []
        self.table.setRowCount(0)
        self.progress.setRange(0, 0)
        self.activity.show()
        self.status.setText('Procurando imagens na pasta…')
        for name, value in [('schema', self.schema.text().strip()), ('version', self.version.text().strip()), ('folder', self.folder.text()), ('delay', self.delay.value())]:
            self.settings.setValue(name, value)
        self.settings.sync()
        for widget in (self.key, self.schema, self.version, self.delay, self.choose, self.send):
            widget.setEnabled(False)
        self.copy.setEnabled(False)
        self.save.setEnabled(False)
        self.cancel.setEnabled(True)
        self.pause_button.setEnabled(True)
        self.resume_button.setEnabled(False)
        self.thread = UploadThread(self.schema.text().strip(), self.key.text().strip(), self.version.text().strip(), self.folder.text(), self.data_dir / 'processed_files_v2.json', self.delay.value(), resume)
        self.thread.event.connect(self.on_event)
        self.thread.completed.connect(self.on_completed)
        self.thread.finished.connect(self.on_finished)
        self.thread.start()

    def on_event(self, event):
        if event['type'] == 'power_warning':
            QMessageBox.warning(self, 'Suspensão automática', event['message'])
        elif event['type'] == 'total':
            self.progress.setRange(0, max(1, event['total']))
            self.progress.setValue(0)
            self.progress.setFormat(f"0 de {event['total']} arquivos concluídos")
        elif event['type'] == 'current':
            self.status.setText(f"{event['phase']}\n{event['file']}")
        elif event['type'] == 'result':
            self.rows.append(event)
            row = self.table.rowCount()
            self.table.insertRow(row)
            for col, key in enumerate(('file', 'status', 'message')):
                item = QTableWidgetItem(event[key])
                item.setToolTip(event[key])
                if event['status'] == 'Enviada':
                    item.setBackground(QColor('#d8efdf'))
                    item.setForeground(QColor('#20472e'))
                if col == 1:
                    item.setForeground(QColor('#b32d36' if event['status'] == 'Erro' else '#17689b'))
                self.table.setItem(row, col, item)
            self.table.scrollToBottom()
            self.progress.setValue(event['done'])
            self.progress.setFormat(f"{event['done']} de {event['total']} arquivos concluídos")

    def cancel_upload(self):
        if self.thread:
            self.thread.stop.set()
            self.cancel.setEnabled(False)
            self.status.setText('Cancelando… A requisição atual precisa terminar antes de parar.')

    def on_completed(self, result):
        self.activity.hide()
        self.progress.setRange(0, max(1, result.get('total', len(self.rows))))
        self.progress.setValue(len(self.rows))
        counts = Counter(row['status'] for row in self.rows)
        summary = ' • '.join(f'{count} {name.lower()}' for name, count in counts.items()) or 'Nenhuma imagem processada.'
        if result.get('fatal'):
            title, detail = 'Envio interrompido', result['fatal']
            notice = QMessageBox.warning
        elif result.get('paused'):
            title, detail = 'Envio pausado', 'Fila salva. Você pode continuar depois. A suspensão será liberada quando não houver outros envios ativos.'
            notice = QMessageBox.information
        elif result.get('cancelled'):
            title, detail = 'Envio cancelado', f"{len(self.rows)} de {result.get('total', 0)} arquivos concluídos."
            notice = QMessageBox.information
        elif not result.get('total'):
            title, detail = 'Pasta sem imagens', 'Escolha uma pasta com arquivos JPG, JPEG ou PNG.'
            notice = QMessageBox.information
        elif counts['Erro']:
            title, detail = 'Concluído com falhas', 'Confira os detalhes. Você pode enviar a pasta novamente; arquivos confirmados serão pulados.'
            notice = QMessageBox.warning
        else:
            title, detail = 'Processamento concluído', 'Confira o resultado de cada arquivo abaixo.'
            notice = QMessageBox.information
        self.status.setText(f'{title}\n{summary}')
        self.copy.setEnabled(True)
        self.save.setEnabled(True)
        self.last_detail = detail
        if not getattr(self, 'embedded', False):
            notice(self, title, f'{summary}\n\n{detail}')

    def on_finished(self):
        self.busy = False
        self.lock.unlock()
        self.cancel.setEnabled(False)
        self.pause_button.setEnabled(False)
        for widget in (self.key, self.schema, self.version, self.delay, self.choose):
            widget.setEnabled(True)
        self.validate()
        self.restore_queue()

    def report(self):
        return self.status.text() + '\n' + getattr(self, 'last_detail', '') + '\n\n' + '\n'.join(
            f"{r['file']}\t{r['status']}\t{r['message']}" for r in self.rows)

    def save_report(self):
        filename, _ = QFileDialog.getSaveFileName(self, 'Salvar relatório', 'relatorio-convertize.txt', 'Texto (*.txt)')
        if filename:
            try:
                Path(filename).write_text(self.report(), encoding='utf-8')
            except OSError:
                QMessageBox.warning(self, 'Não foi possível salvar', 'Escolha uma pasta com permissão de escrita.')

    def closeEvent(self, event):
        if self.busy:
            self.pause_upload()
            QMessageBox.information(self, 'Salvando progresso', 'A pausa foi solicitada. Aguarde a confirmação e feche novamente; a fila poderá ser retomada depois.')
            event.ignore()
        else:
            event.accept()


def run():
    app = QApplication(sys.argv)
    app.setOrganizationName('Convertize')
    app.setApplicationName('Uploader Convertize')
    app.setApplicationVersion('2.2.0')
    smoke_dir = tempfile.TemporaryDirectory() if '--smoke-test' in sys.argv else None
    # Import here avoids a circular import when the main module is frozen.
    from tabs import MultiClient
    window = MultiClient(smoke_dir.name if smoke_dir else None)
    window.show()
    if smoke_dir:
        QTimer.singleShot(500, window.close)
    exit_code = (app.exec if hasattr(app, 'exec') else app.exec_)()
    if smoke_dir:
        window.close()
        smoke_dir.cleanup()
    sys.exit(exit_code)


if __name__ == '__main__':
    run()
