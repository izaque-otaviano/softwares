import sys

if sys.version_info < (3, 9):
    from PySide2.QtCore import QThread, Signal, QSettings, QStandardPaths, QLockFile, QTimer
    from PySide2.QtGui import QColor
    from PySide2.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
        QFormLayout, QLabel, QLineEdit, QPushButton, QFileDialog, QMessageBox,
        QProgressBar, QTableWidget, QTableWidgetItem, QHeaderView, QDoubleSpinBox, QTabWidget, QInputDialog)
else:
    from PySide6.QtCore import QThread, Signal, QSettings, QStandardPaths, QLockFile, QTimer
    from PySide6.QtGui import QColor
    from PySide6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
        QFormLayout, QLabel, QLineEdit, QPushButton, QFileDialog, QMessageBox,
        QProgressBar, QTableWidget, QTableWidgetItem, QHeaderView, QDoubleSpinBox, QTabWidget, QInputDialog)
