# Pure cancellation outcome policy (no UI calls). Loaded by the worker and unit-tested.
#
# Exact meanings:
#   CANCELLED_BEFORE_UI     no recording was active/confirmed when cancellation was observed
#   CANCELLED_CONFIRMED     recording was active, Backspace+RAltUp cleared it, no new bubble
#   UNKNOWN                 release may already have happened, or cancel could not be proven
function Get-CancelOutcome {
  param(
    [bool]$AltDown,
    [bool]$WasRecording,
    [bool]$Cleared,
    [bool]$BubbleAppeared,
    [bool]$Sending,
    [bool]$CancelRequested
  )
  if (-not $CancelRequested) { return 'NONE' }
  if ($Sending) { return 'UNKNOWN' }
  if (-not $AltDown) { return 'CANCELLED_BEFORE_UI' }
  if (-not $Cleared -or $BubbleAppeared) { return 'UNKNOWN' }
  if ($WasRecording) { return 'CANCELLED_CONFIRMED' }
  return 'CANCELLED_BEFORE_UI'
}
