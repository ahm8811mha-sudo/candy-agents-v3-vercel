# يسجل مهمة يومية في Windows Task Scheduler تعمل الساعة 3 عصرا.
# شغله من PowerShell بصلاحية مسؤول:
#   powershell -ExecutionPolicy Bypass -File scheduler\install-task.ps1
#
# للإلغاء لاحقا:
#   Unregister-ScheduledTask -TaskName "المهام اليومية - العلاج الطبيعي والجهاز الهضمي" -Confirm:$false

$ErrorActionPreference = "Stop"

$taskName = "المهام اليومية - العلاج الطبيعي والجهاز الهضمي"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot "run-daily.ps1"

if (-not (Test-Path $runner)) {
    throw "لم يعثر على $runner"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`"" `
    -WorkingDirectory $projectRoot

# 15:00 يوميا. غير الوقت هنا إن أردت وقتا آخر.
$trigger = New-ScheduledTaskTrigger -Daily -At 15:00

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "يسجل المهام الواردة في ملفي إكسل ثم يضع كل معاملة تحت التنفيذ." `
    -RunLevel Limited `
    -Force | Out-Null

Write-Output "تم تسجيل المهمة: $taskName"
Write-Output "الوقت: 3:00 عصرا يوميا"
Write-Output "مجلد المشروع: $projectRoot"
Write-Output ""
Write-Output "لتجربتها فورا دون انتظار:  Start-ScheduledTask -TaskName `"$taskName`""
Write-Output "ملاحظة: -StartWhenAvailable يعني أن المهمة ستعمل عند تشغيل الجهاز إن كان مطفأ الساعة 3."
