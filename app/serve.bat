@echo off
cd /d "%~dp0"
set PORT=8765
set BIND=127.0.0.1
echo.
echo  Banner/Native stand — local HTTP preview
echo  Open: http://%BIND%:%PORT%/login.html  (sign in, then use the app)
echo  Or:   http://%BIND%:%PORT%/index.html  (redirects to login if not signed in)
echo  Root: %CD%
echo  Do not open HTML via file:// — ES modules require http://
echo  Leave this window open while testing. Ctrl+C stops the server.
echo.

REM Prefer Windows "py" launcher (avoids broken Store "python" aliases).
py -3 -m http.server %PORT% --bind %BIND%
if errorlevel 1 (
  echo.
  echo  py -3 failed; trying python ...
  python -m http.server %PORT% --bind %BIND%
)
if errorlevel 1 (
  echo.
  echo  Python not found. Install Python 3, or from this folder run:
  echo    npx --yes serve -l %PORT% .
  pause
  exit /b 1
)
