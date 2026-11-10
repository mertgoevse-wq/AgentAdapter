<#
.SYNOPSIS
    Downloads AgentAdapter and installs it for the current Windows user.

.DESCRIPTION
    One-liner install that does not need a git clone:

        irm https://raw.githubusercontent.com/mertgoevse-wq/AgentAdapter/main/scripts/bootstrap.ps1 | iex

    It downloads the repository archive, runs scripts\install.ps1 from it, and
    removes the temporary files afterwards.

.PARAMETER Ref
    Branch to install. Defaults to main.

.PARAMETER Repo
    GitHub repository in owner/name form.
#>
[CmdletBinding()]
param(
    [string]$Ref = 'main',
    [string]$Repo = 'mertgoevse-wq/AgentAdapter'
)

$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$temp = Join-Path ([IO.Path]::GetTempPath()) ("agentrouter-install-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$archive = "$temp.zip"

try {
    Write-Host "Downloading $Repo@$Ref"
    $url = "https://codeload.github.com/$Repo/zip/refs/heads/$Ref"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing

    Expand-Archive -LiteralPath $archive -DestinationPath $temp -Force
    $root = Get-ChildItem -LiteralPath $temp -Directory | Select-Object -First 1
    if (-not $root) { throw 'The downloaded archive did not contain a repository folder.' }

    $installer = Join-Path $root.FullName 'scripts\install.ps1'
    if (-not (Test-Path -LiteralPath $installer)) { throw "Downloaded archive has no $installer." }

    $hostExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
    if (-not $hostExe) { $hostExe = (Get-Process -Id $PID).Path }

    & $hostExe -NoProfile -ExecutionPolicy Bypass -File $installer
    if ($LASTEXITCODE -ne 0) { throw "The installer exited with code $LASTEXITCODE." }
}
finally {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
