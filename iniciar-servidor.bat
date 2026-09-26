@echo off
title SIMAN - Sistema Integral de Mantenimiento
cls
echo ===================================================================
echo   SIMAN - Sistema de Mantenimiento (Dashboard y App Movil)
echo ===================================================================
echo.
set "PATH=%~dp0..\node-bin\node-v20.18.0-win-x64;%PATH%"
node server.js
pause
