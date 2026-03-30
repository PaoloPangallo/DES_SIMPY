# Script di avvio DES Arena (Backend + Frontend)

Write-Host '🚀 Avvio di DES Arena in corso...' -ForegroundColor Cyan

# 0. Pulizia processi esistenti (Porte 8002 e 5174)
Write-Host '🧹 Pulizia processi precedenti...' -ForegroundColor Gray
Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# 1. Avvio Backend (Porta 8002)
Write-Host '📦 Avvio Backend (FastAPI + SimPy) su porta 8002...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; ..\.venv\Scripts\uvicorn.exe main:app --port 8002 --reload"

# 2. Avvio Frontend (Porta 5174)
Write-Host '🎨 Avvio Frontend (React + Vite) su porta 5174...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev -- --port 5174"

# 3. Attesa e apertura browser
Write-Host '🌐 Apertura browser in corso...' -ForegroundColor Gray
Start-Sleep -Seconds 3
Start-Process "http://localhost:5174"

Write-Host '✅ DES Arena è ora in esecuzione!' -ForegroundColor Green
