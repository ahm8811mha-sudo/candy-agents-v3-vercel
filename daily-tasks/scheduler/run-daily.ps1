# تشغيل الأتمتة اليومية على ويندوز.
# لا تشغل هذا الملف مباشرة لأول مرة — اقرأ README_AR.md أولا وشغل وضع التجربة.

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Output "[$stamp] بدء التشغيل اليومي في $projectRoot"

# يمنع تراكم ملفات السجل والـPDF إلى ما لا نهاية: يحذف ما مضى عليه 90 يوما.
foreach ($folder in @("logs", "pdfs", "screenshots")) {
    $path = Join-Path $projectRoot $folder
    if (Test-Path $path) {
        Get-ChildItem $path -File |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

& node "src/run.js"
$code = $LASTEXITCODE

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($code -eq 0) {
    Write-Output "[$stamp] انتهى التشغيل بنجاح."
} else {
    Write-Output "[$stamp] انتهى التشغيل مع أخطاء (رمز $code). راجع مجلد logs."
}

exit $code
