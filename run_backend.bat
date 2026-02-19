@echo off
REM Pornire backend OpenHouse Spain (FastAPI)
cd /d "%~dp0"

if not exist "venv" (
  echo Creare mediu virtual...
  python -m venv venv
)

call venv\Scripts\activate.bat

echo Verificare dependente...
python -m pip install -q -r requirements.txt

echo.
echo Pornire server: http://0.0.0.0:8000
echo Documentatie API: http://localhost:8000/docs
echo.
uvicorn main:app --reload --host 0.0.0.0 --port 8000
