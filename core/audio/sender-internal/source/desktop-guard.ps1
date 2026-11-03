# Interactive desktop / session probe. Prints one JSON line; anything but ok=true means
# "do not start a WeChat UI task" (fail-closed).
param([switch]$Verbose_)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -LiteralPath (Join-Path (Join-Path $root 'lib') 'SessionGuard.cs')

$line = [SessionGuard]::Check()
$parts = $line -split '\|'
$ok = ($parts.Count -gt 0 -and $parts[0] -eq 'OK')
$map = @{}
for ($i = 1; $i -lt $parts.Count; $i++) {
  $kv = $parts[$i] -split '=', 2
  if ($kv.Count -eq 2) { $map[$kv[0]] = $kv[1] }
}

$out = [ordered]@{
  ok       = $ok
  raw      = $line
  reason   = $(if ($map.ContainsKey('reason')) { $map['reason'] } else { '' })
  session  = $(if ($map.ContainsKey('session')) { $map['session'] } else { '' })
  console  = $(if ($map.ContainsKey('console')) { $map['console'] } else { '' })
  state    = $(if ($map.ContainsKey('state')) { $map['state'] } else { '' })
  desktop  = $(if ($map.ContainsKey('desktop')) { $map['desktop'] } else { '' })
  checkedAt = (Get-Date).ToString('o')
}
$out | ConvertTo-Json -Compress
exit 0
