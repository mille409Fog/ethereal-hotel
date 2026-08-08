@echo off
echo ========================================
echo EtherealHotel Development Environment
echo ========================================
echo.
echo This will start both frontend and backend servers
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo.
echo [1/2] Starting Backend Server...
echo.
start cmd /k "cd backend && run.bat"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo [2/2] Starting Frontend Server...
echo.
start cmd /k "npm start"

echo.
echo ========================================
echo Development servers are starting!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:4200
echo API Docs: http://localhost:8000/docs
echo.
echo Two terminal windows have been opened.
echo Close them to stop the servers.
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul

start http://localhost:4200

echo.
echo Happy coding! 🚀
