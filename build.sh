#!/usr/bin/env bash
#
# Compila e firma l'APK di Babbol SENZA Gradle né Android SDK ufficiale.
# Si esegue nel container (vedi tools/docker/Dockerfile), che ha già tutti i pacchetti:
#   docker run --rm -v "$PWD":/app babbol-build ./build.sh
#
# Uso:   ./build.sh            -> dist/babbol-debug.apk
#
# Prima della build i contenuti devono essere validi e lo snapshot www/content/course.js aggiornato
# (vedi docs/CONTENT_SCHEMA.md: content.js sql -> Supabase -> content.js bundle <rev>).
#
# Variabili sovrascrivibili: ANDROID_JAR, DX, VERSION_CODE, VERSION_NAME
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="${DX:-/usr/lib/android-sdk/build-tools/debian/dx}"
KEYSTORE="$ROOT/android/debug.keystore"
OUT="$ROOT/build/apk"
APK="$ROOT/dist/babbol-debug.apk"

for tool in aapt javac zipalign apksigner keytool; do
  command -v "$tool" >/dev/null || { echo "Manca '$tool' (vedi l'intestazione di build.sh)"; exit 1; }
done
[ -f "$ANDROID_JAR" ] || { echo "android.jar non trovato: $ANDROID_JAR"; exit 1; }
[ -x "$DX" ] || { echo "dx non trovato: $DX"; exit 1; }

echo "==> pulizia"
rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$ROOT/dist"

echo "==> controllo del codice (sintassi JS)"
for f in $(find "$ROOT/www/js" -name '*.js'); do node --check "$f"; done

echo "==> contenuti: validazione e snapshot"
node "$ROOT/tools/content.js" validate
node "$ROOT/tools/content.js" check-bundle

echo "==> risorse + R.java"
aapt package -f -m -J "$OUT/gen" -M "$ROOT/android/AndroidManifest.xml" -S "$ROOT/android/res" -I "$ANDROID_JAR" \
  --min-sdk-version 23 --target-sdk-version 34 \
  ${VERSION_CODE:+--version-code "$VERSION_CODE"} ${VERSION_NAME:+--version-name "$VERSION_NAME"} \
  -F "$OUT/resources.ap_" -A "$ROOT/www"

echo "==> compilazione Java"
find "$ROOT/android/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac --release 8 -Xlint:-options -encoding UTF-8 -classpath "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "==> dex"
"$DX" --dex --output="$OUT/classes.dex" "$OUT/classes"

echo "==> assemblaggio"
cp "$OUT/resources.ap_" "$OUT/unsigned.apk"
( cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "==> creo la chiave di debug"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android -alias babbol-debug \
    -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Babbol Debug,O=Babbol,C=IT" >/dev/null 2>&1
fi

echo "==> firma"
apksigner sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android --ks-key-alias babbol-debug --out "$APK" "$OUT/aligned.apk"
rm -f "$APK.idsig"   # firma v4 non necessaria
apksigner verify "$APK"

echo
aapt dump badging "$APK" | grep -E "^package|sdkVersion|targetSdk|launchable" || true
ls -l "$APK"
