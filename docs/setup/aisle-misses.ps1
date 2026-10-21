# Read-only: lists the shopping names whose saved aisle differs from what the
# app would guess today, to grow the keyword lists in lib/lists/logic.dart.
# Uses your gcloud login. Names and aisles only; the file stays in %TEMP%.
$ErrorActionPreference = 'Stop'
$h = @{ Authorization = "Bearer $(gcloud.cmd auth print-access-token)"; 'x-goog-user-project' = 'alex-todo-shopping' }
$url = 'https://firestore.googleapis.com/v1/projects/alex-todo-shopping/databases/(default)/documents:runQuery'
$q = @{ structuredQuery = @{
    from = @(@{ collectionId = 'history'; allDescendants = $true })
    select = @{ fields = @(@{ fieldPath = 'name' }, @{ fieldPath = 'category' }) }
} } | ConvertTo-Json -Depth 8
$res = Invoke-RestMethod $url -Method Post -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($q))
$rows = @($res | Where-Object { $_.document } | ForEach-Object {
    @{ name = $_.document.fields.name.stringValue; category = $_.document.fields.category.stringValue }
})
$out = Join-Path $env:TEMP 'aisle-history.json'
[IO.File]::WriteAllText($out, (ConvertTo-Json @($rows) -Depth 3), [Text.UTF8Encoding]::new($false))
Push-Location (Split-Path $PSScriptRoot -Parent | Split-Path -Parent)
& C:\src\flutter\bin\dart.bat run tool/aisle_misses.dart $out | Out-File (Join-Path $env:TEMP 'aisle-misses.txt') -Encoding utf8
Pop-Location
"Wrote $env:TEMP\aisle-misses.txt"
