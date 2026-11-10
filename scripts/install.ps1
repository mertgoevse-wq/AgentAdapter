#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$installDir = if ($env:AGENTROUTER_INSTALL_DIR) { $env:AGENTROUTER_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\agentrouter' }
$configDir = Join-Path $env:APPDATA 'agentrouter'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw 'Node.js 20 or newer is required. Install it from https://nodejs.org and reopen PowerShell.'
}
$major = [int]((& node -p 'process.versions.node.split(".")[0]').Trim())
if ($major -lt 20) {
    throw "Node.js 20 or newer is required (found $(& node -v))."
}

Write-Host "Installing to $installDir"
New-Item -ItemType Directory -Force -Path $installDir, $configDir | Out-Null

foreach ($item in @('bin', 'src', 'scripts', 'package.json', 'README.md', 'LICENSE', 'docs')) {
    $source = Join-Path $root $item
    if (Test-Path $source) {
        $target = Join-Path $installDir $item
        if (Test-Path $target) { Remove-Item -Recurse -Force $target }
        Copy-Item -Recurse -Force $source $target
    }
}

$wrappers = @{
    'agentrouter.cmd' = 'bin\agentrouter.js'
    'cc-agent.cmd'    = 'bin\cc-agent.js'
    'codex-agent.cmd' = 'bin\codex-agent.js'
}
foreach ($name in $wrappers.Keys) {
    $body = "@echo off`r`nnode `"%~dp0$($wrappers[$name])`" %*`r`n"
    Set-Content -Path (Join-Path $installDir $name) -Value $body -Encoding ASCII
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @($userPath -split ';' | Where-Object { $_ })
if ($parts -notcontains $installDir) {
    $newPath = (($parts + $installDir) -join ';')
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    $env:Path = "$env:Path;$installDir"
    Write-Host "Added $installDir to the user PATH."
}

$installRecord = [ordered]@{
    version      = 1
    installDir   = $installDir
    binLinks     = @(
        (Join-Path $installDir 'agentrouter.cmd'),
        (Join-Path $installDir 'cc-agent.cmd'),
        (Join-Path $installDir 'codex-agent.cmd')
    )
    windowsPath  = $true
    installedAt  = (Get-Date).ToUniversalTime().ToString('o')
}
$installRecord | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $configDir 'install.json') -Encoding UTF8

Write-Host ''
Write-Host 'Installed. Open a new PowerShell window, then run:'
Write-Host '  agentrouter login'
Write-Host '  cc-agent'
Write-Host '  codex-agent'
Write-Host ''
Write-Host 'For Claude Desktop: agentrouter desktop on   (then restart the app)'
