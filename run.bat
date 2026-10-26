@echo off
setlocal
title RUSH HOUR launcher
cd /d "%~dp0"

set "GAME_PORT=5173"
set "URL=http://localhost:%GAME_PORT%/"

rem ============ 0. Node.js present? ============
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js not found. Install LTS from https://nodejs.org
    echo         or run: winget install OpenJS.NodeJS.LTS
    echo         Then start this launcher again.
    echo.
    pause
    exit /b 1
)

rem ============ 1. Node version: vite 8 needs 20+ ============
for /f "tokens=1 delims=v. " %%v in ('node -v') do set "NODEV=%%v"
if %NODEV% lss 20 (
    echo.
    echo [ERROR] Node.js too old: v%NODEV%. Need 20+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js v%NODEV%

rem ============ 2. npm present? ============
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm not found - broken Node.js install. Reinstall from https://nodejs.org
    echo.
    pause
    exit /b 1
)

rem ============ 3. Game AND records server already healthy? ============
powershell -NoProfile -Command "function T($u){try{ (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }}; if ((T 'http://localhost:5173/') -and (T 'http://localhost:3001/api/leaderboard')) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
    echo [OK] Game and records server already running - opening game: %URL%
    start "" %URL%
    exit /b 0
)

rem ============ 3b. Kill stale processes left on our ports ============
echo Checking for stale processes on ports 5173 / 3001...
powershell -NoProfile -Command "foreach ($p in 5173,3001) { try { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -Unique -ExpandProperty OwningProcess | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host ('  [FIX] killed stale process ' + $_ + ' on port ' + $p) } catch {} } } catch {} }"

rem ============ 4. Dependencies: install if anything is missing ============
set "NEED_INSTALL=0"
if not exist "node_modules\.bin\vite.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\express" set "NEED_INSTALL=1"
if not exist "node_modules\better-sqlite3" set "NEED_INSTALL=1"
if not exist "node_modules\ws" set "NEED_INSTALL=1"
if %NEED_INSTALL%==1 (
    echo.
    echo Installing/refreshing dependencies ^(npm install^)...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Common causes:
        echo         - no internet
        echo         - antivirus blocking the folder
        echo         - read-only folder
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies OK
)

rem ============ 4b. Records + race server ============
echo Starting records/race server (window: RUSH HOUR server)...
start "RUSH HOUR server" cmd /c "set PORT=3001&& node server\index.js & pause"

rem ============ 5. Start game server ============
echo Starting game server...
echo.
echo   The game window will open itself once the server is ready.
echo   You will see several addresses in the server window - that is normal:
echo     Local:   http://localhost:%GAME_PORT%/   ^<- this one is for YOU
echo     Network: ...                        ^<- for OTHER devices on your LAN
echo                                          (needed for the multiplayer race)
echo   If Windows Firewall asks about Node.js - allow it on private networks.
echo.
start "RUSH HOUR game" cmd /c "npm run dev & pause"

echo Waiting for server...
set /a tries=0

:wait
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "function T($u){try{ (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }}; if ((T 'http://localhost:5173/') -and (T 'http://localhost:3001/api/leaderboard')) { exit 0 } else { exit 1 }"
if %errorlevel%==0 goto up
set /a tries+=1
if %tries% geq 30 (
    echo.
    echo [ERROR] Game server did not start in 30 sec.
    echo         Check BOTH windows for details:
    echo         - "RUSH HOUR game"   ^(vite, port %GAME_PORT%, browser page^)
    echo         - "RUSH HOUR server" ^(records and multiplayer, port 3001^)
    echo         Usually: port busy or Node too old.
    echo.
    pause
    exit /b 1
)
goto wait

:up
echo [OK] Game server is up - the browser window should have opened at %URL%
echo      If it did not open, open that address manually.
exit /b 0
