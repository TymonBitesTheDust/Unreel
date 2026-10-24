#!/usr/bin/env bash
# Builds Unreel.apk — the native Android build — without Gradle or the Android SDK manager.
#
# It compiles the blocker from modules/unreel-blocker/android (service, detection, rules, stats)
# plus the framework-only dashboard in native-android/src, so it needs only:
#
#   AAPT2          aapt2 binary            (e.g. Apktool's prebuilt: brut.apktool/apktool-lib/src/main/resources/prebuilt/linux/aapt2)
#   ANDROID_JAR    platform android.jar, API 34   (from the SDK's platforms/android-34)
#   DX_JAR         dx dexer jar            (built from AOSP platform/dalvik dx/src, or use d8 via DEXER)
#   APKSIGNER_JAR  apksigner.jar           (SDK build-tools/<v>/lib/apksigner.jar)
#   KOTLINC        kotlinc launcher, Kotlin 1.9.x (kotlin-stdlib.jar is taken from its lib/).
#                  Not 2.x: its stdlib uses invokedynamic lambdas, which crash on Android unless
#                  desugared by d8/R8 — and this script's dexer doesn't desugar.
#
# Required: KEYSTORE_PASS, the signing key's password. Never commit it or the key.
# Optional: KEYSTORE / KEY_ALIAS (a PKCS12 key is created on first run),
#           VERSION_CODE, VERSION_NAME.
# Run `npm install` at the repo root first — the dashboard's typeface comes from node_modules.
#
# With a normal Android SDK you'd use build-tools' aapt2/d8/apksigner/zipalign directly; this
# script exists so the APK can also be produced on machines that can't reach Google's servers.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
MOD="$ROOT/modules/unreel-blocker/android/src/main"
OUT="$HERE/build"

: "${AAPT2:?set AAPT2}" "${ANDROID_JAR:?set ANDROID_JAR}" "${DX_JAR:?set DX_JAR}"
: "${APKSIGNER_JAR:?set APKSIGNER_JAR}" "${KOTLINC:?set KOTLINC}"
KOTLIN_STDLIB="${KOTLIN_STDLIB:-$(dirname "$KOTLINC")/../lib/kotlin-stdlib.jar}"
if ! "$KOTLINC" -version 2>&1 | grep -q "kotlinc-jvm 1\.9"; then
  echo "KOTLINC must be Kotlin 1.9.x (see header)" >&2
  exit 1
fi
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
KEYSTORE="${KEYSTORE:-$HERE/.keystore/unreel.p12}"
KEYSTORE_PASS="${KEYSTORE_PASS:?set KEYSTORE_PASS to the signing key password}"
KEY_ALIAS="${KEY_ALIAS:-unreel}"
FONTS="$ROOT/node_modules/@expo-google-fonts/barlow-condensed"

rm -rf "$OUT"
mkdir -p "$OUT"/{res,gen,classes,assets/fonts,assets/licenses,stdlib,dex}

echo "› Compiling resources"
"$AAPT2" compile --dir "$MOD/res" -o "$OUT/res/module.zip"
"$AAPT2" compile --dir "$HERE/res" -o "$OUT/res/app.zip"

echo "› Collecting assets"
cp "$MOD/assets/unreel_rules.json" "$OUT/assets/"
cp "$FONTS/600SemiBold/BarlowCondensed_600SemiBold.ttf" "$FONTS/700Bold/BarlowCondensed_700Bold.ttf" "$OUT/assets/fonts/"
# Licences of the third-party code and fonts shipped inside the APK (both require a copy to travel with it).
cp "$FONTS/LICENSE_FONT" "$OUT/assets/licenses/BarlowCondensed-OFL-1.1.txt"
cp "$(dirname "$KOTLINC")/../license/LICENSE.txt" "$OUT/assets/licenses/Kotlin-stdlib-Apache-2.0.txt"
cp "$HERE/../THIRD_PARTY_NOTICES.md" "$OUT/assets/licenses/THIRD_PARTY_NOTICES.md"

echo "› Linking manifest and resources"
"$AAPT2" link -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/AndroidManifest.xml" \
  --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -A "$OUT/assets" \
  --java "$OUT/gen" --extra-packages expo.modules.unreelblocker \
  "$OUT/res/module.zip" "$OUT/res/app.zip"

echo "› Compiling Kotlin"
javac -nowarn --release 8 -d "$OUT/classes" $(find "$OUT/gen" -name '*.java')
SOURCES=$(find "$MOD/java" "$HERE/src" -name '*.kt' ! -name 'UnreelBlockerModule.kt')
# Lambdas and SAM conversions as classes, Java 8 bytecode: no invokedynamic for the dexer to choke on.
"$KOTLINC" -nowarn -jvm-target 1.8 -Xlambdas=class -Xsam-conversions=class \
  -cp "$ANDROID_JAR:$OUT/classes" -d "$OUT/classes" $SOURCES

echo "› Dexing"
(cd "$OUT/stdlib" && unzip -q "$KOTLIN_STDLIB" && rm -rf META-INF/versions module-info.class)
java -Xmx3g -jar "$DX_JAR" --dex --min-sdk-version=26 --output="$OUT/dex/classes.dex" "$OUT/classes" "$OUT/stdlib"

echo "› Packaging"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q "$OUT/unsigned.apk" classes.dex)
python3 "$HERE/zipalign.py" "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "› Signing"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KEYSTORE_PASS" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Unreel" >/dev/null
  echo "  created $KEYSTORE — keep it: updates must be signed with the same key"
fi
java -jar "$APKSIGNER_JAR" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --ks-key-alias "$KEY_ALIAS" \
  --min-sdk-version 26 --out "$OUT/Unreel.apk" "$OUT/aligned.apk"
java -jar "$APKSIGNER_JAR" verify --min-sdk-version 26 "$OUT/Unreel.apk"

echo "✓ $OUT/Unreel.apk ($(du -h "$OUT/Unreel.apk" | cut -f1))"
