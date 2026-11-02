param(
  [Parameter(Mandatory=$true)][ValidateSet('inspect','resize')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$EdgePath,
  [Parameter(Mandatory=$true)][Alias('Profile')][string]$BrowserProfile,
  [Parameter(Mandatory=$true)][string]$AppUrl,
  [ValidateSet('2560x1600','2560x1440','2048x1536','1920x1440')][string]$Preset,
  [ValidateRange(0,5000)][int]$WaitMs=0,
  [switch]$Activate
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$requestedWidth=0; $requestedHeight=0
if($Mode -eq 'resize') {
  if(-not $Preset) { throw 'A preset is required.' }
  $parts=$Preset.Split('x'); $requestedWidth=[int]$parts[0]; $requestedHeight=[int]$parts[1]
}
$result=@{status='failed';width=0;height=0;requestedWidth=$requestedWidth;requestedHeight=$requestedHeight;scale=1;scaled=$false;windowCount=0}
function Finish([string]$status,[string]$reason='') {
  $result.status=$status
  if($reason) { $result.reason=$reason }
  $result | ConvertTo-Json -Compress
  exit 0
}
function NormalPath([string]$path) { [IO.Path]::GetFullPath($path).TrimEnd('\').ToLowerInvariant() }
try {
  $uri=[Uri]$AppUrl
  if($AppUrl -cnotmatch '^http://127\.0\.0\.1:[1-9][0-9]{0,4}/#platform-window=1$' -or $uri.Port -gt 65535) { Finish 'failed' 'invalid-platform-origin' }
  $known=@($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA) | Where-Object { $_ } | ForEach-Object { NormalPath (Join-Path $_ 'Microsoft\Edge\Application\msedge.exe') }
  $expectedEdge=NormalPath $EdgePath; $expectedProfile=NormalPath $BrowserProfile
  if($known -notcontains $expectedEdge -or -not [IO.File]::Exists($EdgePath)) { Finish 'unsupported' 'edge-unavailable' }
  $source=@'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TtrpgPlatformWindow {
  public const string Title = "\u6218\u5c40 \u00b7 \u72ec\u7acb\u8dd1\u56e2\u5e73\u53f0";
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor,Work; public uint Flags; }
  public delegate bool EnumProc(IntPtr hwnd,IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr data);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder text,int size);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int size);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string commandLine,out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
  public static string[] Arguments(string commandLine) {
    int count; IntPtr pointer=CommandLineToArgvW(commandLine,out count);
    if(pointer==IntPtr.Zero) return new string[0];
    try { string[] result=new string[count]; for(int n=0;n<count;n++) result[n]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer,n*IntPtr.Size)); return result; }
    finally { LocalFree(pointer); }
  }
  public static uint Owner(IntPtr hwnd) { uint pid; GetWindowThreadProcessId(hwnd,out pid); return pid; }
  public static bool Matches(IntPtr hwnd,uint[] owners) {
    if(!IsWindow(hwnd)||!IsWindowVisible(hwnd)||GetWindow(hwnd,4)!=IntPtr.Zero) return false;
    uint pid=Owner(hwnd); if(Array.IndexOf(owners,pid)<0) return false;
    StringBuilder klass=new StringBuilder(256),title=new StringBuilder(512);
    GetClassName(hwnd,klass,klass.Capacity); GetWindowText(hwnd,title,title.Capacity);
    return klass.ToString()=="Chrome_WidgetWin_1" && title.ToString()==Title;
  }
  public static long[] Find(uint[] owners) {
    List<long> windows=new List<long>();
    EnumProc callback=delegate(IntPtr hwnd,IntPtr data) { if(Matches(hwnd,owners)) windows.Add(hwnd.ToInt64()); return true; };
    if(!EnumWindows(callback,IntPtr.Zero)) throw new InvalidOperationException("Window enumeration failed.");
    GC.KeepAlive(callback); return windows.ToArray();
  }
}
'@
  Add-Type -TypeDefinition $source -Language CSharp
  function ArgumentValue([string[]]$tokens,[string]$key) {
    $values=@()
    for($n=0;$n -lt $tokens.Length;$n++) {
      if($tokens[$n] -ceq $key) { if($n+1 -lt $tokens.Length) { $values+=,$tokens[$n+1]; $n++ } }
      elseif($tokens[$n].StartsWith($key+'=',[StringComparison]::Ordinal)) { $values+=,$tokens[$n].Substring($key.Length+1) }
    }
    if($values.Count -eq 1) { return $values[0] }
    return $null
  }
  function IsOwnedProcess($process) {
    if(-not $process.ExecutablePath -or -not $process.CommandLine -or (NormalPath $process.ExecutablePath) -ne $expectedEdge) { return $false }
    $tokens=[TtrpgPlatformWindow]::Arguments($process.CommandLine)
    if(@($tokens | Where-Object { $_ -ceq '--type' -or $_.StartsWith('--type=',[StringComparison]::Ordinal) }).Count) { return $false }
    $profileArgument=ArgumentValue $tokens '--user-data-dir'; $appArgument=ArgumentValue $tokens '--app'
    return $profileArgument -and (NormalPath $profileArgument) -eq $expectedProfile -and $appArgument -ceq $AppUrl
  }
  $deadline=[DateTime]::UtcNow.AddMilliseconds($WaitMs)
  do {
    if([IO.Directory]::Exists($BrowserProfile)) {
      $profileItem=Get-Item -LiteralPath $BrowserProfile -Force
      if(($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Finish 'failed' 'unsafe-browser-profile' }
      $owners=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { IsOwnedProcess $_ } | ForEach-Object { [uint32]$_.ProcessId })
      $windows=@([TtrpgPlatformWindow]::Find([uint32[]]$owners))
    } else { $windows=@() }
    if($windows.Count -gt 1) { $result.windowCount=$windows.Count; Finish 'ambiguous' 'multiple-owned-windows' }
    if($windows.Count -eq 1) { break }
    if([DateTime]::UtcNow -ge $deadline) { Finish 'unmanaged' 'window-not-found' }
    Start-Sleep -Milliseconds 100
  } while($true)
  $handle=[IntPtr]([int64]$windows[0]); $ownerPid=[TtrpgPlatformWindow]::Owner($handle)
  $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ownerPid)
  if(-not $current -or -not (IsOwnedProcess $current) -or -not [TtrpgPlatformWindow]::Matches($handle,[uint32[]]@($ownerPid))) { Finish 'unmanaged' 'window-no-longer-owned' }
  $result.windowCount=1; $result.pid=[int64]$ownerPid; $result.windowId=$handle.ToInt64().ToString()
  $oldContext=[TtrpgPlatformWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
  if($oldContext -eq [IntPtr]::Zero) { Finish 'unsupported' 'physical-pixel-context-unavailable' }
  try {
    $rect=New-Object TtrpgPlatformWindow+Rect
    if(-not [TtrpgPlatformWindow]::GetWindowRect($handle,[ref]$rect)) { Finish 'failed' 'window-bounds-unavailable' }
    $result.width=$rect.Right-$rect.Left; $result.height=$rect.Bottom-$rect.Top
    if($Mode -eq 'inspect') { Finish 'found' }
    $monitor=New-Object TtrpgPlatformWindow+MonitorInfo; $monitor.Size=[Runtime.InteropServices.Marshal]::SizeOf($monitor)
    if(-not [TtrpgPlatformWindow]::GetMonitorInfo([TtrpgPlatformWindow]::MonitorFromWindow($handle,2),[ref]$monitor)) { Finish 'failed' 'monitor-unavailable' }
    $workWidth=$monitor.Work.Right-$monitor.Work.Left; $workHeight=$monitor.Work.Bottom-$monitor.Work.Top
    if($workWidth -lt 320 -or $workHeight -lt 240) { Finish 'failed' 'monitor-work-area-too-small' }
    $scale=[Math]::Min(1,[Math]::Min($workWidth/2560.0,$workHeight/1600.0))
    $width=[int][Math]::Floor($requestedWidth*$scale); $height=[int][Math]::Floor($requestedHeight*$scale)
    $left=$monitor.Work.Left+[int][Math]::Floor(($workWidth-$width)/2); $top=$monitor.Work.Top+[int][Math]::Floor(($workHeight-$height)/2)
    $result.scale=$scale; $result.scaled=$scale -lt 1
    if([TtrpgPlatformWindow]::IsZoomed($handle) -or [TtrpgPlatformWindow]::IsIconic($handle)) {
      [void][TtrpgPlatformWindow]::ShowWindowAsync($handle,9)
      $restoreDeadline=[DateTime]::UtcNow.AddMilliseconds(1500)
      while(([TtrpgPlatformWindow]::IsZoomed($handle) -or [TtrpgPlatformWindow]::IsIconic($handle)) -and [DateTime]::UtcNow -lt $restoreDeadline) { Start-Sleep -Milliseconds 25 }
      if([TtrpgPlatformWindow]::IsZoomed($handle) -or [TtrpgPlatformWindow]::IsIconic($handle)) { Finish 'failed' 'window-restore-failed' }
    }
    if(-not [TtrpgPlatformWindow]::Matches($handle,[uint32[]]@($ownerPid))) { Finish 'unmanaged' 'window-no-longer-owned' }
    if(-not [TtrpgPlatformWindow]::SetWindowPos($handle,[IntPtr]::Zero,$left,$top,$width,$height,0x4014)) { Finish 'failed' 'native-window-change-failed' }
    $resizeDeadline=[DateTime]::UtcNow.AddMilliseconds(2000)
    do {
      if(-not [TtrpgPlatformWindow]::Matches($handle,[uint32[]]@($ownerPid)) -or -not [TtrpgPlatformWindow]::GetWindowRect($handle,[ref]$rect)) { Finish 'unmanaged' 'window-no-longer-owned' }
      $result.width=$rect.Right-$rect.Left; $result.height=$rect.Bottom-$rect.Top
      $boundsMatch=$result.width -eq $width -and $result.height -eq $height -and $rect.Left -eq $left -and $rect.Top -eq $top
      if($boundsMatch -and -not [TtrpgPlatformWindow]::IsZoomed($handle)) { break }
      Start-Sleep -Milliseconds 25
    } while([DateTime]::UtcNow -lt $resizeDeadline)
    if(-not $boundsMatch -or [TtrpgPlatformWindow]::IsZoomed($handle)) { Finish 'failed' 'native-window-size-not-applied' }
    if($Activate) { [void][TtrpgPlatformWindow]::SetForegroundWindow($handle) }
    Finish 'resized'
  } finally { [void][TtrpgPlatformWindow]::SetThreadDpiAwarenessContext($oldContext) }
} catch { Finish 'failed' 'native-helper-failed' }
