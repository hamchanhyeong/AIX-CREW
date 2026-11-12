@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 재기지원 규정 작성 지원

where node >/dev/null 2>nul
if errorlevel 1 (
  echo [안내] Node.js가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

if not exist "node_modules\next" (
  echo [1/2] 처음 실행: 필요한 파일을 설치합니다. 몇 분 걸릴 수 있습니다...
  call npm.cmd install
  if errorlevel 1 (
    echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인하거나 다른 네트워크에서 다시 실행하세요.
    pause
    exit /b 1
  )
)

echo [2/2] 서버를 시작합니다. 잠시 후 브라우저가 열립니다.
echo       이 창을 닫으면 프로그램이 종료됩니다.
start "" cmd /c "timeout /t 8 /nobreak >/dev/null & start http://localhost:3000"
call npm.cmd run dev
pause
