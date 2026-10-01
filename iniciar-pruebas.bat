@echo off
title SIMAN - SERVIDOR DE PRUEBAS Y DESARROLLO (MODO AISLADO)
cls
echo ===================================================================
echo   SIMAN - ENTORNO DE PRUEBAS Y EXPERIMENTACION (SEGURO)
echo ===================================================================
echo   * Este servidor es 100%% independiente y no afecta produccion.
echo   * La persistencia en la nube de planta esta protegida y desactivada.
echo   * Puedes probar cambios, modificar disenos y crear tareas de prueba.
echo ===================================================================
echo.
set "PATH=%~dp0..\node-bin\node-v20.18.0-win-x64;%PATH%"
set PORT=3001
set DESACTIVAR_NUBE=true
set STORAGE_BRANCH=db-storage-pruebas

echo Servidor de pruebas iniciado en puerto 3001.
echo.
echo >> Abre tu navegador en:
echo    http://localhost:3001
echo    http://localhost:3001/login
echo.
echo Presiona Ctrl+C en esta ventana para detener el servidor de pruebas.
echo ===================================================================
echo.

node server.js
pause
