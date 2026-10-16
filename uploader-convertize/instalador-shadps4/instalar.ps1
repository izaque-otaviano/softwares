# Instalador automatico do shadPS4 (emulador de PS4 open source) para Windows x64
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$Repo       = 'shadps4-emu/shadPS4'
$InstallDir = Join-Path $env:LOCALAPPDATA 'shadPS4'
$Temp       = Join-Path $env:TEMP 'shadps4-install'

Write-Host '== Instalador shadPS4 ==' -ForegroundColor Cyan
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Requer Windows 64 bits.' }

# 1. Busca a ultima versao no GitHub
Write-Host 'Buscando ultima versao...'
$rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'shadps4-installer' }
$assets = $rel.assets | Where-Object { $_.name -match 'win64' -and $_.name -match '\.zip$' }
$asset  = ($assets | Where-Object { $_.name -match 'qt' } | Select-Object -First 1)
if (-not $asset) { $asset = $assets | Select-Object -First 1 }
if (-not $asset) { throw 'Nenhum pacote Windows x64 encontrado na release.' }
Write-Host "Versao: $($rel.tag_name)  Arquivo: $($asset.name)"

# 2. Download
New-Item -ItemType Directory -Force -Path $Temp | Out-Null
$zip = Join-Path $Temp $asset.name
Write-Host 'Baixando...'
Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing

# 3. Visual C++ Redistributable (dependencia)
$vc = Join-Path $Temp 'vc_redist.x64.exe'
Write-Host 'Instalando Visual C++ Redistributable...'
Invoke-WebRequest 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $vc -UseBasicParsing
Start-Process $vc -ArgumentList '/install','/quiet','/norestart' -Wait

# 4. Extrai (preserva user/ com configs e jogos se ja existir)
Write-Host "Instalando em $InstallDir..."
Get-Process shadps4* -ErrorAction SilentlyContinue | Stop-Process -Force
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive $zip -DestinationPath $InstallDir -Force

$exe = Get-ChildItem $InstallDir -Recurse -Filter '*.exe' |
       Where-Object { $_.Name -match '^shadps4' } | Select-Object -First 1
if (-not $exe) { throw 'Executavel do shadPS4 nao encontrado apos extracao.' }

# 5. Atalhos (Area de Trabalho e Menu Iniciar)
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $lnk = $sh.CreateShortcut((Join-Path $dir 'shadPS4.lnk'))
    $lnk.TargetPath = $exe.FullName
    $lnk.WorkingDirectory = $exe.DirectoryName
    $lnk.Save()
}

Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`nshadPS4 $($rel.tag_name) instalado com sucesso!" -ForegroundColor Green
Write-Host 'Atalho criado na Area de Trabalho e no Menu Iniciar.'
Start-Process $exe.FullName -WorkingDirectory $exe.DirectoryName
