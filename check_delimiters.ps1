param (
    [string[]]$Files = @("injected.js", "content.js", "background.js", "popup/popup.js")
)

$allPassed = $true

foreach ($file in $Files) {
    if (-not (Test-Path $file)) {
        Write-Host "FILE NOT FOUND: $file" -ForegroundColor Red
        $allPassed = $false
        continue
    }

    $text = [System.IO.File]::ReadAllText((Resolve-Path $file).Path)
    $stack = New-Object System.Collections.Generic.Stack[char]
    $line = 1
    $col = 1
    $inString = $false
    $stringChar = [char]0
    $inSingleComment = $false
    $inMultiComment = $false
    $inRegex = $false
    $len = $text.Length
    $errorFound = $false

    for ($i = 0; $i -lt $len; $i++) {
        $c = $text[$i]
        $next = if ($i + 1 -lt $len) { $text[$i + 1] } else { [char]0 }

        if ($c -eq "`n") {
            $line++
            $col = 1
            if ($inSingleComment) { $inSingleComment = $false }
            continue
        } else {
            $col++
        }

        if ($inSingleComment) { continue }
        if ($inMultiComment) {
            if ($c -eq '*' -and $next -eq '/') {
                $inMultiComment = $false
                $i++
            }
            continue
        }

        if ($inString) {
            if ($c -eq '\') {
                $i++ # escape next char
                continue
            }
            if ($c -eq $stringChar) {
                $inString = $false
            }
            continue
        }

        # Check start of comment
        if ($c -eq '/' -and $next -eq '/') {
            $inSingleComment = $true
            $i++
            continue
        }
        if ($c -eq '/' -and $next -eq '*') {
            $inMultiComment = $true
            $i++
            continue
        }

        # Check strings
        if ($c -eq '"' -or $c -eq "'" -or $c -eq '`') {
            $inString = $true
            $stringChar = $c
            continue
        }

        # Brackets tracking
        if ($c -eq '(' -or $c -eq '{' -or $c -eq '[') {
            $stack.Push($c)
        } elseif ($c -eq ')' -or $c -eq '}' -or $c -eq ']') {
            if ($stack.Count -eq 0) {
                Write-Host "UNEXPECTED CLOSING DELIMITER '$c' at $file ($($line):$($col))" -ForegroundColor Red
                $errorFound = $true
                $allPassed = $false
                break
            }
            $top = $stack.Pop()
            if (($c -eq ')' -and $top -ne '(') -or
                ($c -eq '}' -and $top -ne '{') -or
                ($c -eq ']' -and $top -ne '[')) {
                Write-Host "MISMATCHED DELIMITER '$top' with '$c' at $file ($($line):$($col))" -ForegroundColor Red
                $errorFound = $true
                $allPassed = $false
                break
            }
        }
    }

    if (-not $errorFound) {
        if ($stack.Count -gt 0) {
            Write-Host "UNCLOSED DELIMITERS IN $file - Count: $($stack.Count), Top: '$($stack.Peek())'" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "PASS: $file is balanced (Delimiters OK)" -ForegroundColor Green
        }
    }
}

if ($allPassed) {
    Write-Host "ALL JS FILES PERFECTLY BALANCED!" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "DELIMITER CHECK FAILED!" -ForegroundColor Red
    exit 1
}
