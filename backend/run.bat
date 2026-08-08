@echo off
echo ========================================
echo EtherealHotel Dashboard Backend
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Check if dependencies are installed
if not exist "venv\Lib\site-packages\fastapi" (
    echo Installing dependencies...
    pip install -r requirements.txt
    echo.
)

REM Start the server
echo Starting FastAPI server...
echo.
echo Server will be available at:
echo   - REST API: http://localhost:8000
echo   - WebSocket: ws://localhost:8000/ws
echo   - API Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py
