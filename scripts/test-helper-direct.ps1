# Direct helper test: spawn PromptlyHelper.exe, send captureNow, print stdout JSON.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-helper-direct.ps1
# NOTE: keep this file pure ASCII (PS 5.1 reads .ps1 as ANSI without BOM).
$ErrorActionPreference = 'Stop'

$lines = New-Object System.Text.StringBuilder
$gate = New-Object object

$exe = Join-Path $PSScriptRoot '..\build\helper\PromptlyHelper.exe'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.Arguments = '--pid 999999 --threshold 6 --poll 15 --timeout 300'
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

$outHandler = [System.Diagnostics.DataReceivedEventHandler] {
  param($sender, $e)
  if ($e.Data) {
    [void][System.Threading.Monitor]::Enter($script:gate)
    try { [void]$script:lines.AppendLine($e.Data) } finally { [System.Threading.Monitor]::Exit($script:gate) }
  }
}
$errHandler = [System.Diagnostics.DataReceivedEventHandler] {
  param($sender, $e)
  if ($e.Data) {
    [void][System.Threading.Monitor]::Enter($script:gate)
    try { [void]$script:lines.AppendLine("ERR " + $e.Data) } finally { [System.Threading.Monitor]::Exit($script:gate) }
  }
}

$proc.add_OutputDataReceived($outHandler)
$proc.add_ErrorDataReceived($errHandler)

if (-not $proc.Start()) { throw 'failed to start helper' }
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

Start-Sleep -Milliseconds 800
$proc.StandardInput.WriteLine('captureNow')
$proc.StandardInput.Flush()

Start-Sleep -Milliseconds 2500
try { $proc.Kill() } catch { }
Write-Output ('--- HELPER OUTPUT ---')
Write-Output $lines.ToString()
Write-Output 'DIRECT_TEST_DONE'
