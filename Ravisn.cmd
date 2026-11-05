@echo off
rem Starts Ravisn with a visible console, for troubleshooting. Normal use: the Ravisn shortcut.
cd /d "%~dp0app\backend"
".venv\Scripts\python.exe" -m ravisn %*
if errorlevel 1 pause
