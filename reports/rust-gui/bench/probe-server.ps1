# Measurement helper. Reads one command per line from stdin and writes one JSON line per command.
#   tree <pid>            processes in the tree rooted at pid: cpu time, memory, affinity
#   affinity <pid> <mask> set the CPU affinity mask of one process
#   gpu <pid,pid,...>     GPU memory (dedicated / shared) summed over the pids
#   kill <pid>            terminate the whole tree
#   info                  display refresh rate and GPU name
#   cursor                mouse cursor position (to tell whether the user moved it over a window)
#   rect <pid>            screen rectangle of the main window of pid (to make sure it opened on the sub monitor)
# Memory: pws = private working set (the "Memory" column of Task Manager),
#         ws = working set (includes shared pages), priv = private bytes (commit).
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class Probe {
  const uint TH32CS_SNAPPROCESS = 0x2;
  const uint QUERY = 0x1000;          // PROCESS_QUERY_LIMITED_INFORMATION
  const uint SET_INFO = 0x0200;       // PROCESS_SET_INFORMATION
  const uint TERMINATE = 0x0001;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PROCESSENTRY32W {
    public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
    public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
    public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PMC2 {
    public uint cb; public uint PageFaultCount; public UIntPtr PeakWorkingSetSize; public UIntPtr WorkingSetSize;
    public UIntPtr QuotaPeakPagedPoolUsage; public UIntPtr QuotaPagedPoolUsage; public UIntPtr QuotaPeakNonPagedPoolUsage;
    public UIntPtr QuotaNonPagedPoolUsage; public UIntPtr PagefileUsage; public UIntPtr PeakPagefileUsage;
    public UIntPtr PrivateUsage; public UIntPtr PrivateWorkingSetSize; public ulong SharedCommitUsage;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint f, uint p);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h, ref PROCESSENTRY32W e);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr h, ref PROCESSENTRY32W e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr h, out long c, out long e, out long k, out long u);
  [DllImport("kernel32.dll")] static extern bool K32GetProcessMemoryInfo(IntPtr h, ref PMC2 m, uint cb);
  [DllImport("kernel32.dll")] static extern bool GetProcessAffinityMask(IntPtr h, out UIntPtr p, out UIntPtr s);
  [DllImport("kernel32.dll")] static extern bool SetProcessAffinityMask(IntPtr h, UIntPtr m);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint code);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  public static string Cursor() { POINT p; GetCursorPos(out p); return string.Format("{{\"x\":{0},\"y\":{1}}}", p.X, p.Y); }
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  public static void DpiAware() { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
  public static string Rect(IntPtr hwnd) {
    RECT r; if (hwnd == IntPtr.Zero || !GetWindowRect(hwnd, out r)) return "{\"found\":false}";
    return string.Format("{{\"found\":true,\"l\":{0},\"t\":{1},\"r\":{2},\"b\":{3}}}", r.L, r.T, r.R, r.B);
  }

  static List<uint[]> Snapshot() {
    var list = new List<uint[]>();
    IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    var e = new PROCESSENTRY32W(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
    if (Process32FirstW(snap, ref e)) {
      do { list.Add(new uint[] { e.th32ProcessID, e.th32ParentProcessID }); names[e.th32ProcessID] = e.szExeFile; }
      while (Process32NextW(snap, ref e));
    }
    CloseHandle(snap);
    return list;
  }
  static Dictionary<uint, string> names = new Dictionary<uint, string>();

  static long Created(uint pid) {
    IntPtr h = OpenProcess(QUERY, false, pid); if (h == IntPtr.Zero) return long.MaxValue;
    long c, e, k, u; GetProcessTimes(h, out c, out e, out k, out u); CloseHandle(h); return c;
  }

  public static List<uint> TreePids(uint root) {
    var all = Snapshot();
    var result = new List<uint> { root };
    long rootCreated = Created(root);
    for (int i = 0; i < result.Count; i++) {
      foreach (var p in all) {
        // a child must be created after its parent (guards against reused pids)
        if (p[1] == result[i] && p[0] != result[i] && !result.Contains(p[0]) && Created(p[0]) >= rootCreated) result.Add(p[0]);
      }
    }
    return result;
  }

  public static string Tree(uint root) {
    var sb = new StringBuilder("[");
    bool first = true;
    foreach (uint pid in TreePids(root)) {
      IntPtr h = OpenProcess(QUERY, false, pid);
      if (h == IntPtr.Zero) continue;
      long c, e, k, u; GetProcessTimes(h, out c, out e, out k, out u);
      var m = new PMC2(); m.cb = (uint)Marshal.SizeOf(typeof(PMC2));
      K32GetProcessMemoryInfo(h, ref m, m.cb);
      UIntPtr pa, sa; GetProcessAffinityMask(h, out pa, out sa);
      CloseHandle(h);
      string name; names.TryGetValue(pid, out name);
      if (!first) sb.Append(","); first = false;
      sb.AppendFormat("{{\"pid\":{0},\"name\":\"{1}\",\"cpu\":{2},\"ws\":{3},\"pws\":{4},\"priv\":{5},\"aff\":{6}}}",
        pid, name, k + u, m.WorkingSetSize, m.PrivateWorkingSetSize, m.PrivateUsage, pa);
    }
    return sb.Append("]").ToString();
  }

  public static bool Affinity(uint pid, ulong mask) {
    IntPtr h = OpenProcess(SET_INFO | QUERY, false, pid); if (h == IntPtr.Zero) return false;
    bool ok = SetProcessAffinityMask(h, new UIntPtr(mask)); CloseHandle(h); return ok;
  }

  public static int Kill(uint root) {
    var pids = TreePids(root); int n = 0;
    for (int i = pids.Count - 1; i >= 0; i--) {
      IntPtr h = OpenProcess(TERMINATE, false, pids[i]); if (h == IntPtr.Zero) continue;
      if (TerminateProcess(h, 0)) n++; CloseHandle(h);
    }
    return n;
  }
}
"@

[Probe]::DpiAware()

function Gpu([string]$pids) {
  $want = $pids.Split(',') | ForEach-Object { "pid_$($_)_" }
  $ded = 0; $sha = 0
  try {
    $samples = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage', '\GPU Process Memory(*)\Shared Usage' -ErrorAction SilentlyContinue).CounterSamples
    foreach ($s in $samples) {
      foreach ($w in $want) {
        if ($s.InstanceName.StartsWith($w)) {
          if ($s.Path -like '*dedicated usage') { $ded += $s.CookedValue } else { $sha += $s.CookedValue }
        }
      }
    }
  } catch {}
  return "{`"dedicated`":$([long]$ded),`"shared`":$([long]$sha)}"
}

[Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Trim().Split(' ')
  try {
    switch ($parts[0]) {
      'tree' { $out = [Probe]::Tree([uint32]$parts[1]) }
      'affinity' { $out = "{`"ok`":$(([Probe]::Affinity([uint32]$parts[1], [uint64]$parts[2])).ToString().ToLower())}" }
      'gpu' { $out = Gpu $parts[1] }
      'kill' { $out = "{`"killed`":$([Probe]::Kill([uint32]$parts[1]))}" }
      'info' {
        $v = Get-CimInstance Win32_VideoController | Select-Object -First 1
        $out = "{`"refresh`":$($v.CurrentRefreshRate),`"gpu`":`"$($v.Name)`",`"w`":$($v.CurrentHorizontalResolution),`"h`":$($v.CurrentVerticalResolution)}"
      }
      'cursor' { $out = [Probe]::Cursor() }
      'rect' { $out = [Probe]::Rect((Get-Process -Id ([int]$parts[1])).MainWindowHandle) }
      'quit' { exit 0 }
      default { $out = '{"error":"unknown command"}' }
    }
  } catch { $out = "{`"error`":`"$($_.Exception.Message -replace '"','')`"}" }
  [Console]::Out.WriteLine($out); [Console]::Out.Flush()
}
