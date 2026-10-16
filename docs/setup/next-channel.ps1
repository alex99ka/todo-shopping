# Creates the Hosting preview channel "next" (where prereleases' web build goes) and adds
# its domain to Firebase Auth's authorized domains, so Google sign-in works there.
# Every release extends the channel by 30 days; if it ever expires, run this again.
$ErrorActionPreference = 'Stop'
$p = 'alex-todo-shopping'
$ch = firebase.cmd hosting:channel:list --project $p --json | ConvertFrom-Json
$url = ($ch.result.channels | Where-Object { $_.name -like '*/channels/next' }).url
if (-not $url) {
  $url = (firebase.cmd hosting:channel:create next --expires 30d --project $p --json | ConvertFrom-Json).result.url
}
$domain = ([uri]$url).Host

$h = @{ Authorization = "Bearer $(gcloud auth print-access-token)"; 'x-goog-user-project' = $p }
$u = "https://identitytoolkit.googleapis.com/admin/v2/projects/$p/config"
$domains = @(@((Invoke-RestMethod $u -Headers $h).authorizedDomains) + $domain | Select-Object -Unique)
$r = Invoke-RestMethod "$u`?updateMask=authorizedDomains" -Method Patch -Headers $h -ContentType 'application/json' -Body (@{ authorizedDomains = $domains } | ConvertTo-Json)
"next channel: $url"
'authorized domains: ' + ($r.authorizedDomains -join ', ')
