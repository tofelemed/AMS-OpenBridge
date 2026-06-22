@echo off
:: One-click elevated install (UAC prompt). Run from Explorer or cmd.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-opc-core-redist.ps1"
pause
