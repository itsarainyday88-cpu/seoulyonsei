$dirs = Get-ChildItem 'C:\Users\Bijou\AppData\Local\electron-builder\Cache\winCodeSign' -Directory
foreach ($d in $dirs) {
    $darwinLib = Join-Path $d.FullName 'darwin\10.12\lib'
    if (-not (Test-Path $darwinLib)) { New-Item -ItemType Directory -Force -Path $darwinLib | Out-Null }
    '' | Out-File (Join-Path $darwinLib 'libcrypto.dylib') -Force
    '' | Out-File (Join-Path $darwinLib 'libssl.dylib') -Force
    Write-Host "Fixed: $darwinLib"
}
