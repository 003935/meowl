# Claude Code Stop hook: when Claude finishes a reply, restart the Meowl Delete dev
# app if any source file changed since the last check and the app is open.
# (Runs once per reply rather than after every edit, and catches edits made by
# any tool, not just Edit/Write.)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # .claude\hooks -> project
$stamp = Join-Path $root ".claude\.app-restart-stamp"
$logs = Join-Path $root ".claude\hooks\logs"

function Say($msg) { Write-Output (@{ systemMessage = $msg } | ConvertTo-Json -Compress) }

try {
	# Newest change among the files that make up the app
	$files = @(Get-ChildItem (Join-Path $root "src") -Recurse -File) +
		@("electrobun.config.ts", "vite.config.ts", "package.json" | ForEach-Object { Get-Item (Join-Path $root $_) -ErrorAction SilentlyContinue })
	$latest = ($files | Measure-Object LastWriteTime -Maximum).Maximum
	$last = if (Test-Path $stamp) { (Get-Item $stamp).LastWriteTime } else { [datetime]::MinValue }
	if ($latest -le $last) { exit 0 }   # nothing changed

	# Remember this check (also when the app isn't open, so a later manual start isn't followed by a pointless restart)
	Set-Content -Path $stamp -Value (Get-Date -Format o)

	# The running dev app = processes started from this project's dev build folder.
	# (CIM rather than Get-Process: 32-bit PowerShell, which 32-bit Git Bash launches, can't read 64-bit processes' paths.)
	$build = Join-Path $root "build\dev-win-x64"
	$app = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($build, [StringComparison]::OrdinalIgnoreCase) })
	if ($app.Count -eq 0) { exit 0 }   # not open: leave it closed

	$app | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

	# A fresh log per restart: the old run may still hold its log open while it shuts down.
	New-Item -ItemType Directory -Force $logs | Out-Null
	Get-ChildItem $logs -Filter "app-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 4 | Remove-Item -ErrorAction SilentlyContinue
	$log = Join-Path $logs ("app-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
	# The old `electrobun dev` exits once its app does; the new one waits for the build lock if needed.
	Start-Process -FilePath (Get-Command bun).Source -ArgumentList "run", "start" -WorkingDirectory $root `
		-WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"

	Say "Restarting Meowl Delete to pick up the changes."
} catch {
	Say "Couldn't restart Meowl Delete: $($_.Exception.Message)"
}
