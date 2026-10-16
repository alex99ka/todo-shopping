# Installs a release from GitHub: the APK onto the phone over adb (in place, keeps data;
# same key as 3.x), and the Windows installer on this PC.
#   .\install-release.ps1 4.0.0           phone + PC
#   .\install-release.ps1 4.0.0 -PhoneOnly
param([Parameter(Mandatory)][string]$Version, [switch]$PhoneOnly)
$ErrorActionPreference = 'Stop'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$dir = Join-Path $env:TEMP "todo-shopping-$Version"
New-Item -ItemType Directory -Force $dir | Out-Null
gh release download $Version -R alex99ka/todo-shopping -D $dir --clobber -p '*.apk' -p '*.exe'

$devices = @(& $adb devices | Select-String "`tdevice$" | ForEach-Object { ($_ -split "`t")[0] })
if ($devices.Count -ne 1) { throw "Need exactly one phone on adb, found: $($devices -join ', '). Connect with: & '$adb' connect <phone-ip>:<port>" }
& $adb -s $devices[0] install -r (Get-ChildItem $dir -Filter *.apk | Select-Object -First 1).FullName

if (-not $PhoneOnly) { Start-Process (Get-ChildItem $dir -Filter *.exe | Select-Object -First 1).FullName -Wait }
