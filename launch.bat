@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (echo ERROR: Virtual environment not found. Run install.bat first.& pause & exit /b 1)
set "DATA_FOLDER=C:\Users\SAJ104645\OneDrive - Mott MacDonald\Desktop\Projects\UU\icm_csv_calibration_viewer_v20\data"
if "%DATA_FOLDER%"=="" set "DATA_FOLDER=%CD%\data"
if not exist "%DATA_FOLDER%" (echo ERROR: Data folder not found: & echo "%DATA_FOLDER%" & pause & exit /b 1)
echo Starting ICM CSV Calibration Viewer v16...
echo Data folder: %DATA_FOLDER%
echo Cache folder: %DATA_FOLDER%\_icm_viewer_cache_v16
start "" "http://127.0.0.1:8050"
.venv\Scripts\python.exe app.py "%DATA_FOLDER%"
pause
