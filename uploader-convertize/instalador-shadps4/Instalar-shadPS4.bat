@echo off
title Instalador shadPS4
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if errorlevel 1 echo. & echo Ocorreu um erro na instalacao.
pause
