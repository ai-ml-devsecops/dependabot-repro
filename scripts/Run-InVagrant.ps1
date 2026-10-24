[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Recipe = 'terraform-private-registry-module-case',
    [string]$VagrantDirectory,
    [ValidatePattern('^[a-zA-Z0-9_-]+$')]
    [string]$Machine = 'default'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $VagrantDirectory) {
    $VagrantDirectory = Join-Path (Split-Path -Parent $projectRoot) 'devsec\dependabot-lab'
}
$VagrantDirectory = (Resolve-Path -LiteralPath $VagrantDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $VagrantDirectory "Vagrantfile"))) {
    throw 'Supply -VagrantDirectory pointing to the existing Dependabot VM configuration.'
}
if (-not (Test-Path -LiteralPath (Join-Path $VagrantDirectory ".vagrant\machines\$Machine"))) {
    throw "Existing VM state for '$Machine' was not found. This helper does not create a VM."
}
$runId = 'vm-' + (Get-Date -Format 'yyyyMMddTHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$artifactsRoot = Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
$archive = Join-Path $artifactsRoot "$runId.tar.gz"
$sshConfig = Join-Path $artifactsRoot "$runId.ssh-config"
$remoteArchive = "/tmp/dependabot-repro-$runId.tar.gz"
$release = "/home/vagrant/dependabot-repro/releases/$runId"
$remoteOutput = "/home/vagrant/dependabot-repro/artifacts/$runId"

function Assert-NativeSuccess([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed with exit code $LASTEXITCODE." }
}

Push-Location $projectRoot
try {
    & tar -czf $archive .devcontainer .dockerignore .gitignore repro.py recipes examples tests scripts README.md
    Assert-NativeSuccess 'Packaging reviewed project files'
}
finally { Pop-Location }

Push-Location $VagrantDirectory
try {
    & vagrant up $Machine --provider=vmware_desktop --no-provision
    Assert-NativeSuccess 'Resuming the existing VM'
    & vagrant upload $archive $remoteArchive $Machine
    Assert-NativeSuccess 'Uploading the recipe bundle'
    $remoteCommand = "mkdir -p '$release' && tar -xzf '$remoteArchive' -C '$release' && bash '$release/scripts/run-in-vm.sh' '$Recipe' '$runId'"
    & vagrant ssh $Machine -c $remoteCommand
    $runExit = $LASTEXITCODE
    & vagrant ssh-config $Machine --host dependabot-repro-run | Set-Content -LiteralPath $sshConfig -Encoding ascii
    Assert-NativeSuccess 'Generating current SSH configuration'
    & scp -F $sshConfig -r "dependabot-repro-run:$remoteOutput" $artifactsRoot
    Assert-NativeSuccess 'Downloading run evidence'
}
finally { Pop-Location }

$resultPath = Join-Path $artifactsRoot "$runId\result.json"
if (-not (Test-Path -LiteralPath $resultPath)) { throw 'The VM did not return result.json. Inspect the build output.' }
Get-Content -LiteralPath $resultPath
Write-Host "Evidence: $artifactsRoot\$runId"
Write-Host 'The existing VM remains running. Use vagrant suspend in its original directory when finished.'
exit $runExit
