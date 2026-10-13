param(
    [string]$OllamaDirectory = (Join-Path $PSScriptRoot '../tmp/toolchains/ollama-v0.33.3'),
    [string]$ModelsDirectory = (Join-Path $PSScriptRoot '../tmp/toolchains/ollama-models'),
    [string]$Model = 'qwen3:4b',
    [switch]$Verify
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath (Join-Path $OllamaDirectory 'ollama.exe')).Path
$models = (Resolve-Path -LiteralPath $ModelsDirectory).Path
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_MODELS = $models
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '4096'
$env:OLLAMA_KEEP_ALIVE = '0'
$listener = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    foreach ($item in $listener) {
        $process = Get-Process -Id $item.OwningProcess
        if ($item.LocalAddress -ne '127.0.0.1' -or $process.Path -ne $exe) {
            throw 'Port 11434 belongs to a different runtime. Do not reuse or stop it automatically.'
        }
    }
} else {
    Start-Process -FilePath $exe -ArgumentList 'serve' -WorkingDirectory $root -WindowStyle Hidden | Out-Null
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; $ready = $true; break }
    catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'The local model service did not become ready.' }
$tags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
if ($Model -notin $tags.models.name) { throw 'The selected model is not installed. This script does not download models.' }
Write-Output 'Local model runtime is available. Contractor.AI analysis settings have not been changed.'
if ($Verify) {
        $settings = @{ CONTRACTOR_AI_CHAT_AI_ENABLED='true'; CONTRACTOR_AI_CHAT_AI_URL='http://127.0.0.1:11434'; CONTRACTOR_AI_CHAT_AI_MODEL=$Model; CONTRACTOR_AI_CHAT_AI_CONTEXT_TOKENS='4096'; CONTRACTOR_AI_CHAT_AI_VISION_ENABLED='false'; CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE='true' }
    $previous = @{}
    foreach ($name in $settings.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        foreach ($name in $settings.Keys) { [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process') }
        $node = Join-Path $root 'release/ContractorAI-windows-x64/runtime/node.exe'
        if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe).Source }
        & $node --no-warnings (Join-Path $PSScriptRoot 'verify-local-conversation-model.js')
        if ($LASTEXITCODE -ne 0) { throw 'Local quality smoke test failed. Do not activate analysis based on this run.' }
    } finally {
        foreach ($name in $settings.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}
