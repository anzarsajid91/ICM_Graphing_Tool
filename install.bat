@echo off
setlocal
cd /d "%~dp0"
echo Installing ICM CSV Calibration Viewer v20...
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (set PYTHON_CMD=py -3) else (set PYTHON_CMD=python)
%PYTHON_CMD% --version
if %ERRORLEVEL% NEQ 0 (echo ERROR: Python 3 was not found. Install Python 3.10 or newer.& pause & exit /b 1)
if not exist .venv\Scripts\python.exe %PYTHON_CMD% -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
if not exist data mkdir data
echo Installation complete.
pause
