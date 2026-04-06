# Script de configuracion automatica para Turso + Vercel
# Ejecutar: .\setup-turso.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Setup Turso para Spray App" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si turso esta instalado
$turso = Get-Command turso -ErrorAction SilentlyContinue
if (-not $turso) {
    Write-Host "Instalando Turso CLI..." -ForegroundColor Yellow
    winget install --id ChiselStrike.turso --accept-package-agreements --accept-source-agreements
    Write-Host "Turso CLI instalado. Reinicia la terminal y ejecuta este script nuevamente." -ForegroundColor Green
    exit
}

Write-Host "1. Autenticando con Turso..." -ForegroundColor Yellow
turso auth login

Write-Host ""
Write-Host "2. Creando base de datos 'spray-app'..." -ForegroundColor Yellow
$dbExists = turso db list | Select-String "spray-app"
if ($dbExists) {
    Write-Host "   La base de datos 'spray-app' ya existe." -ForegroundColor Green
} else {
    turso db create spray-app
    Write-Host "   Base de datos creada!" -ForegroundColor Green
}

Write-Host ""
Write-Host "3. Obteniendo informacion de la base de datos..." -ForegroundColor Yellow
$dbInfo = turso db show spray-app
Write-Host $dbInfo

Write-Host ""
Write-Host "4. Creando token de acceso..." -ForegroundColor Yellow
$token = turso db tokens create spray-app
Write-Host "   Token creado!" -ForegroundColor Green

Write-Host ""
Write-Host "5. Aplicando schema..." -ForegroundColor Yellow
$schema = Get-Content schema.sql -Raw
turso db shell spray-app --command "$schema"
Write-Host "   Schema aplicado!" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Configuracion completada!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Variables de entorno para Vercel:" -ForegroundColor Yellow
Write-Host "-----------------------------------"

# Extraer URL de la base de datos
$dbUrl = "libsql://spray-app-" + (turso account show | Select-String "username" | ForEach-Object { $_.Line.Split()[1] }) + ".turso.io"

Write-Host "TURSO_DATABASE_URL: $dbUrl" -ForegroundColor Cyan
Write-Host "TURSO_AUTH_TOKEN: $token" -ForegroundColor Cyan
Write-Host "JWT_SECRET: super-secret-key-cambiar-esto" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pasos finales:" -ForegroundColor Yellow
Write-Host "1. Ve a https://vercel.com/dashboard" 
Write-Host "2. Selecciona tu proyecto"
Write-Host "3. Ve a Settings > Environment Variables"
Write-Host "4. Agrega las variables de arriba"
Write-Host "5. Redeploy el proyecto"
Write-Host ""
