# Windows sign-in for the Flutter app: reuses the Desktop OAuth client the Drive backup
# already made (its id and secret are in the Pi's todo-notifier .env). Prints no secret.
$ErrorActionPreference = 'Stop'
$pi = 'alex99ka@pi5-home-server.local'
$key = "$HOME\.ssh\pi5"
$id = ssh -i $key $pi "grep '^DRIVE_CLIENT_ID=' ~/todo-notifier/.env | cut -d= -f2-"
$secret = ssh -i $key $pi "grep '^DRIVE_CLIENT_SECRET=' ~/todo-notifier/.env | cut -d= -f2-"
if (-not $id -or -not $secret) { throw 'DRIVE_CLIENT_ID/SECRET not found in ~/todo-notifier/.env' }

$repos = @('alex99ka/todo-shopping')
if ($args -contains '-AlsoRecipe') { $repos += 'alex99ka/recipe-book' }
foreach ($r in $repos) {
  gh variable set GOOGLE_DESKTOP_CLIENT_ID -R $r --body $id.Trim()
  gh secret set GOOGLE_DESKTOP_CLIENT_SECRET -R $r --body $secret.Trim()
  gh variable set FIREBASE_PROJECT -R $r --body alex-todo-shopping
}
gh variable list -R alex99ka/todo-shopping
gh secret list -R alex99ka/todo-shopping
