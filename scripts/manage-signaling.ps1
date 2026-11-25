param(
  [ValidateSet('install','start','stop','status','uninstall')][string]$Action='status',
  [int]$Port=4444,
  [string]$TaskName='FinanceWiki-Signaling',
  [switch]$AtStartup
)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$State=Join-Path $Root 'runtime'
$Status=Join-Path $State 'status.json'
$Lock=Join-Path $State 'supervisor.lock'
$Stop=Join-Path $State 'stop.request'
$Node=(Get-Command node.exe -ErrorAction Stop).Source
$Supervisor=Join-Path $PSScriptRoot 'signaling-supervisor.mjs'
function Get-ManagedTask {
  $t=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if($t -and ($t.Actions.Count -ne 1 -or $t.Actions[0].Arguments -notlike ('*"'+$Supervisor+'"*'))) {
    throw "Task name is occupied by a different program."
  }
  return $t
}
function Show-State {
  $t=Get-ManagedTask
  if($t){Write-Output "Task: $($t.State)"; Get-ScheduledTaskInfo -TaskName $TaskName | Select-Object LastRunTime,LastTaskResult}
  else{Write-Output 'Task not installed'}
  if(Test-Path $Status){Get-Content -Raw $Status}
  Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
}
function Stop-Owned {
  $t=Get-ManagedTask
  if(!$t){throw 'Task is not installed'}
  if($t.State -eq 'Running'){
    New-Item -ItemType Directory -Force $State | Out-Null
    New-Item -ItemType File -Force $Stop | Out-Null
    $deadline=(Get-Date).AddSeconds(30)
    do {Start-Sleep -Milliseconds 500;$t=Get-ManagedTask} while($t.State -eq 'Running' -and (Get-Date) -lt $deadline)
    if($t.State -eq 'Running'){throw 'Graceful stop timed out; no unknown process was terminated'}
  }
}
switch($Action){
  'install' {
    if(Get-ManagedTask){throw 'Task exists; uninstall explicitly before replacing'}
    New-Item -ItemType Directory -Force $State | Out-Null
    $user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $arguments='"'+$Supervisor+'" --port '+$Port+' --state "'+$State+'"'
    $a=New-ScheduledTaskAction -Execute $Node -Argument $arguments -WorkingDirectory $Root
    if($AtStartup){
      $trigger=New-ScheduledTaskTrigger -AtStartup
      $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
    }else{
      $trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
      $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    }
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $TaskName -Action $a -Trigger $trigger -Principal $principal -Settings $settings -Description 'FinanceWiki local signaling supervisor' | Out-Null
    Show-State
  }
  'start' {if(!(Get-ManagedTask)){throw 'Install task first'}; Start-ScheduledTask -TaskName $TaskName; Show-State}
  'stop' {Stop-Owned;Show-State}
  'status' {Show-State}
  'uninstall' {Stop-Owned;Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false;Write-Output 'Task removed; runtime logs retained.'}
}
