# Recover Docker Desktop's stale Windows IPC socket startup failure.
# Does not stop running Docker or change images, containers, volumes or secrets.
$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'com.docker.backend','Docker Desktop' -ErrorAction SilentlyContinue) {
    Write-Output 'Docker is already running; no socket directories were changed.'
    exit 0
}
$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
$socketSets = @{
    'Docker\run' = @('dockerEthernetVfkit','dockerInference','sailor-ingest.sock','sailor-ingest.sock.stale')
    'docker-secrets-engine' = @('engine.sock','engine.sock.stale')
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
foreach ($relative in $socketSets.Keys) {
    $source = [IO.Path]::GetFullPath((Join-Path $localRoot $relative))
    $destination = $source + '-stale-' + $stamp
    foreach ($candidate in @($source, $destination)) {
        if (-not $candidate.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Unexpected socket directory path.'
        }
    }
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $entries = @(Get-ChildItem -LiteralPath $source -Force)
    foreach ($entry in $entries) {
        if ($entry.PSIsContainer -or $entry.Name -notin $socketSets[$relative] -or
            $entry.Length -ne 0 -or -not ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Unexpected content in $source. Preserving it; inspect manually."
        }
    }
    if (Get-Process -Name 'com.docker.backend','Docker Desktop' -ErrorAction SilentlyContinue) {
        throw 'Docker started during inspection; refusing to move active sockets.'
    }
    Move-Item -LiteralPath $source -Destination $destination
    Write-Output "Preserved stale sockets at $destination"
}
& docker desktop start --detach
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop start failed.' }
