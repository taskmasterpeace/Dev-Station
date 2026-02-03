# DevStation Desktop Shortcut Setup
$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath("Desktop")
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create Desktop Shortcut
$Shortcut = $WshShell.CreateShortcut("$Desktop\DevStation.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/k cd /d `"$ScriptDir`" && node server.js"
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "DevStation - Dev Server Dashboard"
$Shortcut.IconLocation = "$ScriptDir\devstation.ico,0"
$Shortcut.Save()

Write-Host ""
Write-Host "  DevStation shortcut created on Desktop!" -ForegroundColor Green
Write-Host ""
Write-Host "  Double-click it to start DevStation"
Write-Host "  Then open http://localhost:4000"
Write-Host ""
