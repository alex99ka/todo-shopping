#!/usr/bin/env bash
set -euo pipefail

: "${VERSION:?set VERSION, for example 1.0.0}"
: "${VERSION_CODE:?set VERSION_CODE, for example 1000000}"

gradle=android/app/build.gradle
sed -i.orig -E \
  -e "s/^([[:space:]]*)versionCode [0-9]+$/\1versionCode ${VERSION_CODE}/" \
  -e "s/^([[:space:]]*)versionName \"[^\"]*\"$/\1versionName \"${VERSION}\"/" \
  "$gradle"
rm "$gradle.orig"
grep -Eq "^[[:space:]]*versionCode ${VERSION_CODE}$" "$gradle"
grep -Eq "^[[:space:]]*versionName \"${VERSION}\"$" "$gradle"

# Without these, @capacitor-firebase/authentication leaves Google sign-in out and the app crashes at startup.
cat >> android/variables.gradle <<'EOF'

ext {
    rgcfaIncludeGoogle = true
    androidxCredentialsVersion = '1.3.0'
}
EOF
grep -q 'rgcfaIncludeGoogle = true' android/variables.gradle

# The google-services Gradle plugin skips a missing or foreign file silently, so check it here.
project_id=$(jq -r '.projects.default' .firebaserc)
app_id=$(sed -nE "s/^[[:space:]]*appId: '([^']+)',$/\1/p" capacitor.config.ts)
jq -e --arg project "$project_id" --arg app "$app_id" '
  .project_info.project_id == $project
  and any(.client[]; .client_info.android_client_info.package_name == $app
    and any(.oauth_client[]?; .client_type == 3))' google-services.json > /dev/null \
  || { echo "google-services.json is not for project $project_id and app $app_id" >&2; exit 1; }
cp google-services.json android/app/google-services.json

npx --yes @capacitor/assets@3.0.5 generate --android --androidProject android \
  --assetPath resources \
  --iconBackgroundColor '#047857' --iconBackgroundColorDark '#047857' \
  --splashBackgroundColor '#f3faf7' --splashBackgroundColorDark '#0b1512'

# Push notifications need a white-on-transparent status bar icon; without one
# Android shows the launcher icon as a white square.
res=android/app/src/main/res
mkdir -p "$res/drawable" "$res/values"
cp resources/android/ic_stat_notify.xml "$res/drawable/"
cp resources/android/notify_colors.xml "$res/values/"
manifest=android/app/src/main/AndroidManifest.xml
meta='<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" /><meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notify_accent" />'
sed -i.orig "s|</application>|${meta}</application>|" "$manifest"
rm "$manifest.orig"
grep -q 'default_notification_icon' "$manifest"
