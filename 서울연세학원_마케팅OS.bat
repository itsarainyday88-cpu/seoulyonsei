@echo off
:: 서울대/연세대 원장님 직강 마케팅 OS 실행기 (James 납품용)
pushd "%~dp0"
powershell -ExecutionPolicy Bypass -File "scripts\dist-launcher.ps1"
popd
exit
