@echo off
setlocal
cd /d "%~dp0\.."
if not exist ".venv-workbench" (
  py -3.12 -m venv .venv-workbench
  if errorlevel 1 goto :fail
)
call .venv-workbench\Scripts\activate.bat
python -m pip install --upgrade pip
if errorlevel 1 goto :fail
python -m pip install -e .
if errorlevel 1 goto :fail
python -c "import icm_workbench, pandas, numpy; print('ICM Workbench installation OK:', icm_workbench.__version__)"
if errorlevel 1 goto :fail
echo Installation completed successfully.
exit /b 0
:fail
echo Installation failed. Review the error above.
exit /b 1
