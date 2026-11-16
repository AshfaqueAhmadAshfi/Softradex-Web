@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SoftradeX Trade (TypeScript + Vite)

if not exist "node_modules" (
  call setup.bat auto
  if errorlevel 1 exit /b 1
)

set "PORT=8777"
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=%PORT%;for($i=0;$i -lt 60;$i++){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',$p);$c.Close();break}catch{Start-Sleep -Milliseconds 500}};Start-Process ('http://127.0.0.1:'+$p+'/dashboard')"

echo   Starting SoftradeX Trade on http://127.0.0.1:%PORT%/dashboard ...
call npm run dev
pause
