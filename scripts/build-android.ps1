param([string]$Sdk = $env:ANDROID_HOME, [string]$Gradle)
$ErrorActionPreference = 'Stop'
$taskProfile = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../android-runtime.json') -Raw | ConvertFrom-Json
if (-not $Sdk) { throw 'Set ANDROID_HOME or supply -Sdk with the selected SDK.' }
$taskPlatform = Join-Path $Sdk ('platforms/' + $taskProfile.android.platform)
if (-not $Sdk -or -not (Test-Path -LiteralPath (Join-Path $taskPlatform 'android.jar')) -or
    -not (Test-Path -LiteralPath (Join-Path $Sdk ('build-tools/' + $taskProfile.android.build_tools + '/source.properties')))) {
    throw "Select installed final SDK $($taskProfile.android.platform) and Build Tools $($taskProfile.android.build_tools). This script does not install tools or accept licenses."
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/javac.exe'))) {
    throw "Set JAVA_HOME to an installed stable JDK $($taskProfile.java.version)."
}
$taskCompiler = (& (Join-Path $env:JAVA_HOME 'bin/javac.exe') --version)
if ($LASTEXITCODE -ne 0 -or ([string]$taskCompiler).Trim() -notmatch ('^javac ' + [regex]::Escape($taskProfile.java.version) + '(?:\.\d+)*(?:\+\d+)?$')) {
    throw "Select stable JDK $($taskProfile.java.version); observed $taskCompiler."
}
$androidRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../android')).Path
$command = if ($Gradle) { (Get-Command $Gradle -ErrorAction Stop).Source } else { Join-Path $androidRoot 'gradlew.bat' }
if (-not (Test-Path -LiteralPath $command)) { throw "Gradle launcher not found: $command" }
$taskPreviousSdk = $env:ANDROID_HOME
Push-Location $androidRoot
try {
    $env:ANDROID_HOME = (Resolve-Path -LiteralPath $Sdk).Path
    & $command --no-daemon :app:assembleDebug :app:lintDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android compilation or lint failed.' }
    Get-Item -LiteralPath 'app/build/outputs/apk/debug/app-debug.apk'
} finally {
    Pop-Location
    $env:ANDROID_HOME = $taskPreviousSdk
}
