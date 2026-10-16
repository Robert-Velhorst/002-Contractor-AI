param([string]$Sdk = $env:ANDROID_HOME, [string]$Gradle)
$ErrorActionPreference = 'Stop'
if (-not $Sdk -or -not (Test-Path -LiteralPath (Join-Path $Sdk 'build-tools/37.0.0/source.properties'))) {
    throw 'Install Android SDK platform 37 and Build Tools 37.0.0 using the official tools after reviewing their terms, then set ANDROID_HOME. No licenses are accepted by this script.'
}
$platformsRoot = Join-Path $Sdk 'platforms'
$apiPlatform = Join-Path $platformsRoot 'android-37'
if (-not (Test-Path -LiteralPath (Join-Path $apiPlatform 'android.jar'))) {
    $platformSource = @('android-37.2', 'android-37.1', 'android-37.0') |
        ForEach-Object { Join-Path $platformsRoot $_ } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'android.jar') } |
        Select-Object -First 1
    if (-not $platformSource) {
        throw 'Install Android SDK Platform 37 using the official tools after reviewing its terms. No licenses are accepted by this script.'
    }
    New-Item -ItemType Junction -Path $apiPlatform -Target $platformSource | Out-Null
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
    throw 'Set JAVA_HOME to an installed JDK 17 or later.'
}
$androidRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../android')).Path
$command = if ($Gradle) { (Get-Command $Gradle -ErrorAction Stop).Source } else { Join-Path $androidRoot 'gradlew.bat' }
if (-not (Test-Path -LiteralPath $command)) { throw "Gradle launcher not found: $command" }
$env:ANDROID_HOME = (Resolve-Path -LiteralPath $Sdk).Path
Push-Location $androidRoot
try {
    & $command --no-daemon :app:assembleDebug :app:lintDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android compilation or lint failed.' }
    Get-Item -LiteralPath 'app/build/outputs/apk/debug/app-debug.apk'
} finally { Pop-Location }
