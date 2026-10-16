# Creates config/app (kill switch) and config/access (who gets prereleases) in Firestore.
# Uses your gcloud login (project owner), so security rules don't apply to this write.
$ErrorActionPreference = 'Stop'
$h = @{ Authorization = "Bearer $(gcloud auth print-access-token)"; 'x-goog-user-project' = 'alex-todo-shopping' }
$base = 'https://firestore.googleapis.com/v1/projects/alex-todo-shopping/databases/(default)/documents'

$app = @{ fields = @{ minVersion = @{ stringValue = '0.0.0' }; message = @{ stringValue = '' } } }
$access = @{ fields = @{ earlyUsers = @{ arrayValue = @{ values = @(@{ stringValue = 'alex98ka@gmail.com' }) } } } }

Invoke-RestMethod "$base/config/app" -Method Patch -Headers $h -ContentType 'application/json' -Body ($app | ConvertTo-Json -Depth 8) | Out-Null
Invoke-RestMethod "$base/config/access" -Method Patch -Headers $h -ContentType 'application/json' -Body ($access | ConvertTo-Json -Depth 8) | Out-Null
(Invoke-RestMethod "$base/config" -Headers $h).documents | ForEach-Object { $_.name; $_.fields | ConvertTo-Json -Depth 8 -Compress }
