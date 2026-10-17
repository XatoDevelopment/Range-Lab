@echo off
setlocal
cd /d "%~dp0"

chcp 65001 >nul
set "PYTHONUTF8=1"

set "BASE=%~dp0"
set "PYTHON=%BASE%Python_Embedded\python.exe"
set "APP=%BASE%app.py"
set "LOGDIR=%BASE%logs"
set "PIDFILE=%BASE%ranglab_server.pid"
set "URL=http://127.0.0.1:5000/login"

if not exist "%PYTHON%" (
    echo ERROR: No se encuentra:
    echo %PYTHON%
    pause
    exit /b 1
)

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem Si ya hay un servidor funcionando en el puerto 5000, no arrancamos otro.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/login' -TimeoutSec 1; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
    start "" "%URL%"
    exit /b 0
)

rem Arrancar Python embebido y guardar el PID del proceso.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Start-Process -FilePath '%PYTHON%' -ArgumentList '\"%APP%\"' -WorkingDirectory '%BASE%' -RedirectStandardOutput '%LOGDIR%\server.log' -RedirectStandardError '%LOGDIR%\server_error.log' -PassThru; Set-Content -Path '%PIDFILE%' -Value $p.Id"
if errorlevel 1 (
    echo ERROR: No se pudo iniciar RangeLab.
    pause
    exit /b 1
)

echo Iniciando RangeLab...

rem Esperar hasta que Flask responda.
set /a COUNT=0
:WAIT
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/login' -TimeoutSec 1; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto READY

set /a COUNT+=1
if %COUNT% GEQ 30 (
    echo.
    echo ERROR: RangeLab no respondio despues de 30 segundos.
    echo Revisa:
    echo %LOGDIR%\server.log
    echo %LOGDIR%\server_error.log
    pause
    exit /b 1
)

timeout /t 1 /nobreak >nul
goto WAIT

:READY
echo RangeLab esta listo.
start "" "%URL%"
exit /b 0
