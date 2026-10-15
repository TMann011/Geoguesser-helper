Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot "icons"

if (!(Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
}

foreach ($sz in @(16, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 15, 24))
    
    $penWidth = [math]::Max(1, [int]($sz / 12))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 255, 176), $penWidth)
    $g.DrawEllipse($pen, 2, 2, $sz - 5, $sz - 5)
    
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 215, 0))
    $innerSz = [int]($sz / 3)
    $g.FillEllipse($brush, $innerSz, $innerSz, $innerSz, $innerSz)
    
    $g.Dispose()
    $outPath = Join-Path $iconsDir "icon$sz.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated PNG: $outPath"
}
