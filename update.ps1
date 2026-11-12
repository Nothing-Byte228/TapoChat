<#
.SYNOPSIS
    Smart Updater for TapoChat (No Git required)
    Downloads the latest repository state from GitHub and updates only changed files.
#>

$RepoZipUrl = "https://github.com/Nothing-Byte228/TapoChat/archive/refs/heads/main.zip"
$TempDir = Join-Path $env:TEMP "TapoChat_Update_Temp"
$ZipPath = Join-Path $TempDir "repo.zip"
$ExtractPath = Join-Path $TempDir "extracted"

# Путь к папке проекта (директория, где лежит сам скрипт)
$TargetDir = $PSScriptRoot

Write-Host "[*] Подготовка к обновлению TapoChat..." -ForegroundColor Cyan

# 1. Очистка временной папки на случай прошлых запусков
if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $ExtractPath | Out-Null

try {
    # 2. Скачивание ZIP-архива с GitHub
    Write-Host "[*] Скачивание свежей версии с GitHub..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $ZipPath

    # 3. Распаковка архива во временную папку
    Write-Host "[*] Распаковка архива..." -ForegroundColor Yellow
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractPath -Force

    # GitHub упаковывает репозиторий в папку вида 'TapoChat-main' — находим её динамически
    $SourceRoot = Get-ChildItem -Path $ExtractPath | Select-Object -ExpandProperty FullName

    # 4. Список файлов/папок, которые ни в коем случае нельзя трогать (например, конфиги electron-store)
    $ExcludedItems = @("config.json", "node_modules", ".git", ".env")

    Write-Host "[*] Сравнение файлов и обновление..." -ForegroundColor Yellow
    $SourceFiles = Get-ChildItem -Path $SourceRoot -Recurse

    $updatedCount = 0

    foreach ($file in $SourceFiles) {
        if ($file.PSIsContainer) { continue }

        # Получаем относительный путь файла внутри проекта
        $relativePath = $file.FullName.Substring($SourceRoot.Length + 1)

        # Проверяем на наличие в списке исключений
        $skip = $false
        foreach ($ex in $ExcludedItems) {
            if ($relativePath -like "*$ex*") {
                $skip = $true
                break
            }
        }
        if ($skip) { continue }

        $targetFile = Join-Path $TargetDir $relativePath
        $targetParent = [System.IO.Path]::GetDirectoryName($targetFile)

        # Если папка для файла не существует в проекте — создаем
        if (!(Test-Path $targetParent)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }

        # Умное обновление: проверяем, существует ли файл и изменился ли его хэш
        $updateNeeded = $false
        if (!(Test-Path $targetFile)) {
            $updateNeeded = $true
        } else {
            $sourceHash = (Get-FileHash -Path $file.FullName -Algorithm MD5).Hash
            $targetHash = (Get-FileHash -Path $targetFile -Algorithm MD5).Hash
            if ($sourceHash -ne $targetHash) {
                $updateNeeded = $true
            }
        }

        # Если файл новый или изменился — копируем
        if ($updateNeeded) {
            Copy-Item -Path $file.FullName -Destination $targetFile -Force
            Write-Host "    [+] Обновлен файл: $relativePath" -ForegroundColor Green
            $updatedCount++
        }
    }

    Write-Host "`n[✔] Обновление успешно завершено! Изменено файлов: $updatedCount" -ForegroundColor Green
}
catch {
    Write-Host "`n[✖] Ошибка во время обновления: $_" -ForegroundColor Red
}
finally {
    # 5. Очистка мусора во временной папке
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force
    }
}

Write-Host "Обновление успешно установлено! Перезапуск TapoChat..." -ForegroundColor Green
Start-Sleep -Seconds 3 # Небольшая пауза, чтобы файлы точно записались на диск

# Запуск npm run start без появления консольного окна
Start-Process "npm.cmd" -ArgumentList "run", "start" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden

Exit