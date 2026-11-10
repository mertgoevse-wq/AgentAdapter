#Requires -Version 5.1
<#
.SYNOPSIS
    Installs AgentAdapter for the current Windows user.

.DESCRIPTION
    Copies the app to %LOCALAPPDATA%\Programs\agentrouter, writes
    agentrouter.cmd / cc-agent.cmd / codex-agent.cmd, and adds that folder to
    the *user* PATH. No administrator rights and no machine-wide changes.

.PARAMETER RepoRoot
    Repository root to install from. Defaults to the parent of scripts\.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1

.EXAMPLE
    .\scripts\install.cmd
#>
[CmdletBinding()]
param(
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

trap {
    Write-Host ''
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
        Write-Host $_.InvocationInfo.PositionMessage.Trim() -ForegroundColor DarkGray
    }
    Write-Host ''
    Write-Host 'If this is unexpected, report the lines above.' -ForegroundColor DarkGray
    exit 1
}

function Resolve-NodeExe {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:AGENTROUTER_NODE) { $candidates.Add($env:AGENTROUTER_NODE) }

    foreach ($name in @('node.exe', 'node')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command -and $command.Source) { $candidates.Add($command.Source) }
    }

    if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles 'nodejs\node.exe')) }
    if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')) }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')) }
    if ($env:APPDATA) { $candidates.Add((Join-Path $env:APPDATA 'nvm\node.exe')) }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Find-ToolPath([string]$name) {
    $files = @($name, "$name.exe", "$name.cmd", "$name.bat")
    $dirs = @()
    foreach ($entry in ($env:Path -split ';')) { if ($entry.Trim()) { $dirs += $entry.Trim() } }
    if ($env:USERPROFILE) { $dirs += (Join-Path $env:USERPROFILE '.local\bin') }
    if ($env:APPDATA) { $dirs += (Join-Path $env:APPDATA 'npm') }
    if ($env:LOCALAPPDATA) { $dirs += (Join-Path $env:LOCALAPPDATA 'Programs\claude') }
    foreach ($dir in $dirs) {
        foreach ($file in $files) {
            $candidate = Join-Path $dir $file
            if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
        }
    }
    return $null
}

function Find-GitBash {
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Git\bin\bash.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    return $null
}

function Add-UserPath([string]$directory) {
    $normalized = $directory.TrimEnd('\')
    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = @($current -split ';' | Where-Object { $_ -and $_.Trim() })
    foreach ($part in $parts) {
        if ($part.Trim().TrimEnd('"').TrimEnd('\') -ieq $normalized) { return $false }
    }
    $newPath = (@($parts) + $normalized) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    return $true
}

$root = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { Split-Path -Parent $PSScriptRoot }
if (-not (Test-Path -LiteralPath (Join-Path $root 'bin\agentrouter.js'))) {
    throw "install.ps1 must run from the repository checkout (expected $root\bin\agentrouter.js)."
}

$installDir = if ($env:AGENTROUTER_INSTALL_DIR) { $env:AGENTROUTER_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\agentrouter' }
$configDir = if ($env:AGENTROUTER_CONFIG_DIR) { $env:AGENTROUTER_CONFIG_DIR } else { Join-Path $env:APPDATA 'agentrouter' }
$installDir = $installDir.TrimEnd('\')

$nodeExe = Resolve-NodeExe
if (-not $nodeExe) {
    throw @'
Node.js 20 or newer was not found.
Install it with one of these, then open a NEW PowerShell window and run this script again:
  winget install OpenJS.NodeJS.LTS
  https://nodejs.org/en/download
'@
}

$nodeVersion = (& $nodeExe -p 'process.versions.node').Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required (found v$nodeVersion at $nodeExe)."
}

Write-Host "Using Node.js v$nodeVersion ($nodeExe)"
Write-Host "Installing to $installDir"

New-Item -ItemType Directory -Force -Path $installDir, $configDir | Out-Null

if ((Resolve-Path -LiteralPath $root).Path.TrimEnd('\') -ne $installDir) {
    foreach ($item in @('bin', 'src', 'scripts', 'package.json', 'README.md', 'LICENSE', 'docs')) {
        $source = Join-Path $root $item
        if (-not (Test-Path -LiteralPath $source)) { continue }
        $target = Join-Path $installDir $item
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    }
}
else {
    Write-Host 'The repository is already the install directory; skipping the copy.'
}

$entryPoints = [ordered]@{
    'agentrouter.cmd' = 'bin\agentrouter.js'
    'cc-agent.cmd'    = 'bin\cc-agent.js'
    'codex-agent.cmd' = 'bin\codex-agent.js'
}
foreach ($name in $entryPoints.Keys) {
    $entry = Join-Path $installDir $entryPoints[$name]
    $body = @(
        '@echo off'
        'setlocal'
        "if exist `"$nodeExe`" ("
        "  `"$nodeExe`" `"$entry`" %*"
        ') else ('
        "  node `"$entry`" %*"
        ')'
    ) -join "`r`n"
    Set-Content -LiteralPath (Join-Path $installDir $name) -Value "$body`r`n" -Encoding ASCII
}

if (Add-UserPath $installDir) {
    Write-Host "Added $installDir to the user PATH."
}
$onPath = @($env:Path -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ieq $installDir })
if ($onPath.Count -eq 0) { $env:Path = "$env:Path;$installDir" }

$version = $null
try {
    $version = (& $nodeExe (Join-Path $installDir 'bin\agentrouter.js') version 2>&1 | Out-String).Trim()
}
catch {
    Write-Host "Warning: the installed copy did not report a version: $($_.Exception.Message)" -ForegroundColor Yellow
}

$installRecord = [ordered]@{
    version     = 1
    installDir  = $installDir
    nodeExe     = $nodeExe
    binLinks    = @(
        (Join-Path $installDir 'agentrouter.cmd'),
        (Join-Path $installDir 'cc-agent.cmd'),
        (Join-Path $installDir 'codex-agent.cmd')
    )
    windowsPath = $true
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
}
# Written without a BOM: Node's JSON.parse rejects the BOM that PowerShell 5.1 adds.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $configDir 'install.json'),
    ($installRecord | ConvertTo-Json -Depth 4),
    $utf8NoBom
)

Write-Host ''
if ($version) { Write-Host "Installed: $($version.Split("`n")[0])" -ForegroundColor Green }

# Native Windows only: AgentAdapter never uses WSL, neither does Claude Code.
Write-Host 'Native Windows check (WSL is not required):'
$claudePath = Find-ToolPath 'claude'
if ($claudePath) {
    Write-Host "  Claude Code: $claudePath"
}
else {
    Write-Host '  Claude Code is not installed. In PowerShell run:' -ForegroundColor Yellow
    Write-Host '    irm https://claude.ai/install.ps1 | iex'
    Write-Host '    (or: winget install Anthropic.ClaudeCode)'
}
$codexPath = Find-ToolPath 'codex'
if ($codexPath) {
    Write-Host "  Codex CLI:   $codexPath"
}
else {
    Write-Host '  Codex CLI is not installed (optional): npm install -g @openai/codex' -ForegroundColor Yellow
}
$gitBash = Find-GitBash
if ($gitBash) {
    Write-Host "  Git Bash:    $gitBash (cc-agent passes it to Claude Code)"
}
else {
    Write-Host '  Git for Windows not found. Optional: Claude Code then uses its PowerShell tool.'
    Write-Host '    winget install --id Git.Git -e'
}

Write-Host ''
Write-Host 'Run these in a NEW PowerShell window (PATH changes need one):'
Write-Host ''
Write-Host '  agentrouter login'
Write-Host '  cc-agent'
Write-Host '  codex-agent'
Write-Host ''
Write-Host 'Claude Desktop: agentrouter desktop on   (then restart the app completely)'
Write-Host 'Undo everything: agentrouter undo'
Write-Host ''
