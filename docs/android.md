# Android app (Google Play)

The Android app is a Trusted Web Activity (TWA). It opens https://playboms.eu/ full-screen in the
phone's Chrome, so it has no game code of its own and every site deploy updates the app's content.
The project lives in [`android/`](../android).

## Build

Needs JDK 21 and the Android SDK (platform 36). From `android/`, in PowerShell:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.13.1+2"
.\gradlew.bat assembleRelease bundleRelease
```

- `app/build/outputs/bundle/release/app-release.aab` is what you upload to Google Play.
- `app/build/outputs/apk/release/app-release.apk` installs directly on a phone.

The version comes from `<meta name="app-version">` in `index.html`: 1.4.4 becomes versionName
`1.4.4` and versionCode `10404`. Google Play rejects an upload whose versionCode it has already
seen, so bump the site version before building a new release.

## Signing

The upload key is `%USERPROFILE%\.android-keys\boms-upload.jks`. Its password is in
`boms-upload.properties` in the same folder. Both stay outside the repo, so back them up. To build
from another machine, copy both files there or set `BOMS_SIGNING_PROPERTIES` to the properties
file. Without them the release build comes out unsigned.

## Full-screen depends on `.well-known/assetlinks.json`

Chrome hides its address bar only when https://playboms.eu/.well-known/assetlinks.json lists the
SHA-256 fingerprint of the key the installed app is signed with. Otherwise the app still works, but
shows a URL bar.

Google Play re-signs uploads with its own app signing key. After the first upload, copy the
**App signing key certificate** SHA-256 from Play Console › Test and release › App integrity, and
add it to `sha256_cert_fingerprints`. Keep the upload key's fingerprint as well, because a
sideloaded APK is signed with that one.

`_config.yml` tells GitHub Pages' Jekyll build to serve `.well-known/`, which it skips by default.
