@echo off
setlocal
cd /d "%~dp0\.."
if not exist ".venv-workbench\Scripts\python.exe" (
  echo Workbench environment not found. Run scripts\install_workbench.bat first.
  exit /b 1
)
set "DATA_DIR=%~1"
if "%DATA_DIR%"=="" set "DATA_DIR=%CD%\examples\demo"
.venv-workbench\Scripts\python.exe -m icm_workbench --data-dir "%DATA_DIR%" --port 8050
exit /b %errorlevel%
