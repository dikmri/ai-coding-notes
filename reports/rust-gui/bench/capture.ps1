# 指定したプロセスの窓を PNG に撮る。GPU で描く窓も撮れるよう PrintWindow の PW_RENDERFULLCONTENT を使う。
# 使い方: powershell -NoProfile -File capture.ps1 -ProcessId 1234 -Out shot.png
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Out
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Cap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
}
"@
[void][Cap]::SetProcessDpiAwarenessContext([IntPtr](-4))  # PER_MONITOR_AWARE_V2
$p = Get-Process -Id $ProcessId
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Error "窓が見つからない"; exit 1 }
$wr = New-Object Cap+RECT
[void][Cap]::GetWindowRect($h, [ref]$wr)
$fr = New-Object Cap+RECT
# DWMWA_EXTENDED_FRAME_BOUNDS = 9（影を除いた見た目の枠）
[void][Cap]::DwmGetWindowAttribute($h, 9, [ref]$fr, 16)
$w = $wr.R - $wr.L; $hgt = $wr.B - $wr.T
$bmp = New-Object System.Drawing.Bitmap $w, $hgt
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][Cap]::PrintWindow($h, $hdc, 2)  # PW_RENDERFULLCONTENT
$g.ReleaseHdc($hdc); $g.Dispose()
$crop = New-Object System.Drawing.Rectangle ($fr.L - $wr.L), ($fr.T - $wr.T), ($fr.R - $fr.L), ($fr.B - $fr.T)
$out2 = $bmp.Clone($crop, $bmp.PixelFormat)
$out2.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "$($crop.Width)x$($crop.Height)"
