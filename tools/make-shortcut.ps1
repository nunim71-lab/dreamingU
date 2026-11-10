$ErrorActionPreference = "Stop"
# 바탕화면에 "꿈탐정" 바로가기를 만듭니다.
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop "꿈탐정.lnk"))
$link.TargetPath = Join-Path $root "start.bat"
$link.WorkingDirectory = $root
$link.IconLocation = (Join-Path $root "tools\icon.ico") + ",0"
$link.WindowStyle = 7  # 검은 창은 작게(최소화) 띄움
$link.Description = "꿈탐정 부엉: 황금 망토를 두른 하얀 부엉이가 꿈을 별자리 차트와 함께 풀어 드려요"
$link.Save()
Write-Host ""
Write-Host "바탕화면에 [꿈탐정] 바로가기를 만들었어요!"
Write-Host "이 폴더를 옮기거나 지우면 바로가기가 작동하지 않으니, 폴더는 그대로 두세요."
