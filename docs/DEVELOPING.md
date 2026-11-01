# Developing Unreel

Back to the [README](../README.md). Design decisions, platform limits and edge cases are in [ARCHITECTURE.md](ARCHITECTURE.md).

## What's where

| Path | What it is |
|---|---|
| `native-android/` | The release APK: a framework-only Android dashboard plus `build-apk.sh` |
| `modules/unreel-blocker/android/` | The blocker shared by both Android builds: accessibility service, detection rules, overlay, stats |
| `modules/unreel-blocker/android/src/main/assets/unreel_rules.json` | The view IDs and labels Unreel matches. Update these when YouTube or Instagram change their layout |
| `src/`, `modules/unreel-blocker/ios/`, `targets/` | The Expo (React Native) app, its iOS Screen Time bridge and the iOS extensions |
| `iphone/unreel.user.js` | The Safari userscript, generated from the Safari extension by `npm run build:userscript` (with `unreel.meta.js`, which Userscripts polls for updates) |
| `iphone/index.html`, `iphone/pause/` | The iPhone setup guide and the pause page, published to GitHub Pages by `.github/workflows/iphone.yml` |
| `scripts/test-userscript.mjs` | Runs `content.js` against a list of URLs and checks that `rules.json` agrees: `npm run test:userscript` |

## Build the release APK

```bash
npm install   # the dashboard's typeface comes from node_modules
KEYSTORE_PASS=… AAPT2=… ANDROID_JAR=… DX_JAR=… APKSIGNER_JAR=… KOTLINC=… ./native-android/build-apk.sh
```

The script header lists the tools it expects. It needs Kotlin 1.9 and no Gradle.

### The release signing key

Every Android app must be signed, and Android only accepts an update if it's signed with the same key as the version already installed. Unreel's key is a `.p12` file (a password-protected key store). It's what produces the certificate fingerprint in [ANDROID-HELP.md](ANDROID-HELP.md#troubleshooting).

- **Where it goes:** save it as `native-android/.keystore/unreel.p12`, or point the build at it with `KEYSTORE=/path/to/key.p12`. Pass its password as `KEYSTORE_PASS`. If no key exists there, the script creates a new one, which can't update existing installs.
- **Sign every release with it.** An APK signed with any other key fails with "App not installed" for everyone who has Unreel, until they uninstall and lose their settings.
- **Back it up.** If the key is lost, existing users can never get an update again.
- **Never publish it.** Don't commit it (it's already in `.gitignore`), attach it to a release or share its password. Anyone who has both can make an APK that phones accept as a genuine Unreel update.
- **Change the password** with `keytool -storepasswd -keystore native-android/.keystore/unreel.p12`.

## Build the Expo app

```bash
npm install
npm run android                                          # local development build
npx eas-cli@latest build -p android --profile preview    # APK built in Expo's cloud
```

The **Android APK** GitHub Actions workflow builds it too. That APK is signed with a different key, so it can't update the release APK.

The iPhone version of the Expo app (Screen Time lock plus a Safari extension) needs a Mac with Xcode and a paid Apple Developer account, and the App Store version needs Apple's Family Controls approval. See [ARCHITECTURE.md](ARCHITECTURE.md).

## When detection breaks after an app update

1. Run a debug build and open the screen that isn't caught.
2. Run `adb logcat -s UnreelDiag`. It prints the view IDs on screens that nothing matched.
3. Add the new ID to `unreel_rules.json` and raise `version`.

## The Safari script and iPhone pages

- `targets/safari/assets/content.js`, `content.css` and `rules.json` are the source. After changing them, raise `userscript.version` in `package.json` and run `npm run build:userscript`, or installed scripts won't update.
- `npm run test:userscript` checks the redirects; `npm run check:userscript` checks the generated script is up to date.
- `.github/workflows/iphone.yml` runs both and publishes `iphone/` to GitHub Pages (Settings → Pages → Source: GitHub Actions). The README and setup guide link to `tymonbitesthedust.github.io/Unreel`; change them if the repository moves.

## Publishing a release

The README's download and issue links are relative (`../../releases/latest`, `../../raw/HEAD/…`, `../../issues`), so they work in any GitHub repository, as long as:

- `README.md` stays at the top of the repository;
- each release is published, not saved as a draft or marked as a **pre-release** (GitHub's "latest" skips both), and has `Unreel.apk` attached with exactly that name;
- `iphone/unreel.user.js` stays at that path. iPhone users install it straight from the repository, because Safari saves release attachments as downloads instead of letting Userscripts install them;
- Issues stay turned on (**Settings → General → Features → Issues**).
