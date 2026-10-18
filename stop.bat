@echo off
setlocal
cd /d "%~dp0"

set "PIDFILE=%~dp0rangelab_server.pid"

if not exist "%PIDFILE%" (
    echo RangeLab no tiene un PID registrado.
    echo Si el servidor sigue abierto, puedes cerrarlo manualmente.
    pause
    exit /b 0
)

set /p PID=<"%PIDFILE%"

if "%PID%"=="" (
    del "%PIDFILE%" >nul 2>&1
    exit /b 0
)

echo Cerrando RangeLab (PID %PID%)...

taskkill /PID %PID% /T /F >nul 2>&1

del "%PIDFILE%" >nul 2>&1

echo RangeLab cerrado.
timeout /t 2 /nobreak >nul
exit /b 0
