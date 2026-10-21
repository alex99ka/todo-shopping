# Adds an account to config/access.earlyUsers (gets prereleases first, and the
# "גרסאות בטא" switch in Settings). Keeps everyone already there.
#   powershell -File docs/setup/early-user.ps1 alex99ka@gmail.com
param([Parameter(Mandatory)][string]$Email)
$ErrorActionPreference = 'Stop'
$p = 'alex-todo-shopping'
$h = @{ Authorization = "Bearer $(gcloud.cmd auth print-access-token)"; 'x-goog-user-project' = $p }
$db = "projects/$p/databases/(default)"
$body = @{ writes = @(@{ transform = @{
    document = "$db/documents/config/access"
    fieldTransforms = @(@{ fieldPath = 'earlyUsers'; appendMissingElements = @{ values = @(@{ stringValue = $Email.Trim().ToLower() }) } })
} }) } | ConvertTo-Json -Depth 10
Invoke-RestMethod "https://firestore.googleapis.com/v1/$db/documents:commit" -Method Post -Headers $h -ContentType 'application/json' -Body $body | Out-Null
'earlyUsers: ' + ((Invoke-RestMethod "https://firestore.googleapis.com/v1/$db/documents/config/access" -Headers $h).fields.earlyUsers.arrayValue.values.stringValue -join ', ')
