package it.babbol.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;
import java.util.Set;

/**
 * Guscio nativo di Babbol.
 *
 * L'interfaccia e la logica didattica vivono in assets/ (HTML/CSS/JS, funzionano offline).
 * Questa Activity mette a disposizione della pagina ciò che solo Android sa fare, tramite
 * l'oggetto JavaScript "AndroidBridge":
 *   - sintesi vocale (TextToSpeech) per ascoltare le parole e le frasi
 *   - voci diverse (accento e tono) per gli speaker dei dialoghi, con avviso di fine audio
 *   - riconoscimento vocale (RecognizerIntent) per gli esercizi di pronuncia
 *   - colore della barra di stato (tema chiaro/scuro)
 * e passa alla pagina i link babbol://auth-callback delle email (conferma account, recupero password).
 *
 * Il codice è volutamente senza lambda: la toolchain usata per la build (dx) è quella classica.
 */
public class MainActivity extends Activity {

    private static final int REQ_SPEECH = 4711;
    private static final String START_URL = "file:///android_asset/index.html";

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private boolean ttsWarned = false;
    private long lastBackAt = 0;
    private int utterance = 0;
    private boolean voiceOverridden = false;
    private static final String RELEASES = "https://github.com/GiuseppeBellamacina/babbol/releases/";
    private volatile boolean updateCancelled = false;
    private volatile boolean updateBusy = false;
    private String lastVoiceKey = "";
    private Voice lastVoice = null;
    private boolean pageReady = false;
    private String pendingAuthUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        applyBars(false);

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                ttsReady = (status == TextToSpeech.SUCCESS);
                if (ttsReady) {
                    tts.setLanguage(Locale.UK);
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String id) { }

                        @Override
                        public void onDone(String id) { notifyDone(id); }

                        @Override
                        public void onError(String id) { notifyDone(id); }
                    });
                }
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: qui vivono i progressi
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                    // il layout non deve rompersi con font di sistema grandi
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // l'app non deve mai navigare fuori dai propri asset
                return !url.startsWith("file:///android_asset/");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverAuthUrl();
            }
        });
        setContentView(web);
        takeAuthUrl(getIntent());
        UpdateProvider.apk(this).delete();
        web.loadUrl(START_URL);
    }

    /** Link dall'email con l'app già aperta (launchMode singleTask). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        takeAuthUrl(intent);
        deliverAuthUrl();
    }

    private void takeAuthUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "babbol".equals(data.getScheme())) {
            pendingAuthUrl = data.toString();
        }
    }

    private void deliverAuthUrl() {
        if (!pageReady || pendingAuthUrl == null) {
            return;
        }
        String url = pendingAuthUrl;
        pendingAuthUrl = null;
        runJs("window.__onAuthCallback ? window.__onAuthCallback(" + JSONObject.quote(url) + ") : (window.__pendingAuthUrl = " + JSONObject.quote(url) + ")");
    }

    /** Fine della lettura di una sequenza (l'id è quello dell'ultima frase, passato dalla pagina). */
    private void notifyDone(String id) {
        if (id != null && id.startsWith("seq")) {
            runJs("window.__onTtsDone && window.__onTtsDone(" + JSONObject.quote(id) + ")");
        }
    }

    /** Colori di barra di stato e di navigazione coerenti con il tema dell'app. */
    private void applyBars(boolean dark) {
        Window w = getWindow();
        int color = dark ? Color.parseColor("#131F24") : Color.WHITE;
        w.setStatusBarColor(color);
        w.setNavigationBarColor(color);
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (dark) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        } else {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    private void runJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(js, null);
                }
            }
        });
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    /** Imposta lingua e velocità; ritorna false se non c'è una voce inglese installata. */
    private boolean prepareVoice(String langTag, float rate) {
        if (!ttsReady) {
            if (!ttsWarned) {
                ttsWarned = true;
                toast("Sintesi vocale non disponibile: controlla Impostazioni > Sintesi vocale.");
            }
            return false;
        }
        int r = tts.setLanguage(Locale.forLanguageTag(langTag));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            r = tts.setLanguage(Locale.ENGLISH);
        }
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            if (!ttsWarned) {
                ttsWarned = true;
                toast("Voce inglese non installata: aggiungila da Impostazioni > Sintesi vocale.");
            }
            return false;
        }
        tts.setSpeechRate(Math.max(0.2f, Math.min(2.0f, rate)));
        return true;
    }

    /**
     * Genere di una voce di sistema: 'm', 'f' oppure '?'. Si riconosce dal nome ("female"/"male" in molti motori)
     * o dal codice delle voci Google ("en-gb-x-gbb-local": gbb = maschile, gba = femminile...).
     */
    private char genderOfVoice(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.contains("female")) {
            return 'f';
        }
        if (n.contains("male")) {
            return 'm';
        }
        int x = n.indexOf("-x-");
        if (x >= 0 && n.length() >= x + 6) {
            String code = n.substring(x + 3, x + 6);
            String[] males = {"gbb", "gbd", "rjs", "iol", "iom", "tpd", "aub", "aud", "ind"};
            String[] females = {"gba", "gbc", "gbf", "fis", "sfg", "iob", "iog", "tpc", "tpf", "aua", "auc", "inc"};
            for (String m : males) {
                if (m.equals(code)) {
                    return 'm';
                }
            }
            for (String f : females) {
                if (f.equals(code)) {
                    return 'f';
                }
            }
        }
        return '?';
    }

    /** Sceglie tra le voci installate una voce inglese del genere richiesto (variant = quale, se ce ne sono piu' di una). */
    private boolean selectGenderVoice(String langTag, String gender, int variant) {
        if (gender == null || gender.isEmpty()) {
            return false;
        }
        // nel parlato lento si chiama una volta per parola: si riusa la scelta fatta per la stessa voce
        String key = langTag + "|" + gender + "|" + variant;
        if (key.equals(lastVoiceKey) && lastVoice != null) {
            tts.setVoice(lastVoice);
            voiceOverridden = true;
            return true;
        }
        try {
            Set<Voice> all = tts.getVoices();
            if (all == null) {
                return false;
            }
            Locale want = Locale.forLanguageTag(langTag);
            ArrayList<Voice> offline = new ArrayList<Voice>();
            ArrayList<Voice> online = new ArrayList<Voice>();
            for (Voice v : all) {
                Locale l = v.getLocale();
                if (l == null || !"en".equals(l.getLanguage())) {
                    continue;
                }
                if (!want.getCountry().isEmpty() && !want.getCountry().equalsIgnoreCase(l.getCountry())) {
                    continue;
                }
                if (v.getFeatures() != null && v.getFeatures().contains("notInstalled")) {
                    continue;
                }
                if (genderOfVoice(v.getName()) != gender.charAt(0)) {
                    continue;
                }
                if (v.isNetworkConnectionRequired()) {
                    online.add(v);
                } else {
                    offline.add(v);
                }
            }
            ArrayList<Voice> pool = offline.isEmpty() ? online : offline;
            if (pool.isEmpty()) {
                return false;
            }
            Collections.sort(pool, new Comparator<Voice>() {
                @Override
                public int compare(Voice a, Voice b) {
                    return a.getName().compareTo(b.getName());
                }
            });
            Voice chosen = pool.get(Math.abs(variant) % pool.size());
            tts.setVoice(chosen);
            lastVoiceKey = key;
            lastVoice = chosen;
            voiceOverridden = true;
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Ponte JS -> Android. I metodi sono chiamati su un thread dedicato, non su quello UI. */
    public final class Bridge {
        @JavascriptInterface
        public void speak(String text, String lang, float rate) {
            if (prepareVoice(lang, rate)) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "babbol");
            }
        }

        @JavascriptInterface
        public void speakQueued(String text, String lang, float rate) {
            if (prepareVoice(lang, rate)) {
                tts.speak(text, TextToSpeech.QUEUE_ADD, null, "babbol");
            }
        }

        /**
         * Frase con lingua, velocità e tono propri (le voci dei dialoghi).
         * id non vuoto = avvisa la pagina quando questa frase finisce; queued = in coda invece di interrompere.
         */
        @JavascriptInterface
        public void speakVoice(String text, String lang, float rate, float pitch, String id, boolean queued, String gender, int variant) {
            if (prepareVoice(lang, rate)) {
                // con una voce del genere giusto il tono cambia poco (serve solo a distinguere due speaker dello stesso genere)
                boolean gendered = selectGenderVoice(lang, gender, variant);
                if (!gendered && voiceOverridden) {
                    // dopo una voce scelta per genere si torna a quella predefinita dell'accento richiesto
                    voiceOverridden = false;
                    try {
                        tts.setVoice(tts.getDefaultVoice());
                    } catch (RuntimeException e) {
                        // si resta con la voce corrente
                    }
                    prepareVoice(lang, rate);
                }
                float p = gendered ? 1.0f + (pitch - 1.0f) * 0.25f : pitch;
                tts.setPitch(Math.max(0.5f, Math.min(2.0f, p)));
                String uid = (id == null || id.isEmpty()) ? "babbol" + (++utterance) : id;
                tts.speak(text, queued ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, null, uid);
            } else if (id != null && !id.isEmpty()) {
                notifyDone(id);
            }
        }

        /** Pausa (in coda) tra una frase e l'altra: serve al parlato lento. */
        @JavascriptInterface
        public void silence(int ms) {
            if (ttsReady) {
                tts.playSilentUtterance(Math.max(50, Math.min(3000, ms)), TextToSpeech.QUEUE_ADD, "babbol-pause" + (++utterance));
            }
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (ttsReady) {
                tts.stop();
            }
        }

        @JavascriptInterface
        public void listen(final String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say it in English");
                    try {
                        startActivityForResult(i, REQ_SPEECH);
                    } catch (ActivityNotFoundException e) {
                        runJs("window.__onSpeech({ok:false,error:'unavailable'})");
                    }
                }
            });
        }

        /** Versione installata (versionName del manifest). */
        @JavascriptInterface
        public String getVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (PackageManager.NameNotFoundException e) {
                return "";
            }
        }

        /**
         * Scarica la nuova versione (solo da una release del progetto) e apre l'installatore.
         * Esiti alla pagina: __onUpdateProgress(pct), __onUpdateReady(), __onUpdateError(codice).
         */
        @JavascriptInterface
        public void downloadUpdate(final String url, final String sha256) {
            if (url == null || !url.startsWith(RELEASES + "download/")) {
                updateError("url");
                return;
            }
            if (updateBusy) {
                return;
            }
            if (!canInstallPackages()) {
                // da Android 8 l'utente deve consentire a Babbol di installare app: si apre la schermata giusta
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + getPackageName())));
                        } catch (ActivityNotFoundException e) {
                            // resta il messaggio
                        }
                    }
                });
                updateError("permission");
                return;
            }
            updateBusy = true;
            updateCancelled = false;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    fetchUpdate(url, sha256);
                }
            }).start();
        }

        @JavascriptInterface
        public void cancelUpdate() {
            updateCancelled = true;
        }

        /** Apre nel browser la pagina della release (alternativa se l'aggiornamento automatico non riesce). */
        @JavascriptInterface
        public void openReleasePage(final String url) {
            if (url == null || !url.startsWith(RELEASES)) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (ActivityNotFoundException e) {
                        toast("Nessun browser disponibile.");
                    }
                }
            });
        }

        @JavascriptInterface
        public void setStatusBar(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applyBars(dark);
                    if (web != null) {
                        web.setBackgroundColor(dark ? Color.parseColor("#131F24") : Color.WHITE);
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SPEECH) {
            return;
        }
        JSONObject out = new JSONObject();
        try {
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                JSONArray arr = new JSONArray();
                if (results != null) {
                    for (String r : results) {
                        arr.put(r);
                    }
                }
                out.put("ok", true);
                out.put("results", arr);
            } else {
                out.put("ok", false);
                out.put("error", "cancelled");
            }
        } catch (JSONException e) {
            // non può succedere con chiavi costanti; in caso, la pagina riceve un errore generico
            runJs("window.__onSpeech({ok:false,error:'internal'})");
            return;
        }
        runJs("window.__onSpeech(" + out.toString() + ")");
    }

    // ---------------------------------------------------------------- aggiornamento dell'app

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < 26) {
            return true;
        }
        try {
            // PackageManager.canRequestPackageInstalls() esiste dall'API 26; l'android.jar di build è l'API 23
            Object r = getPackageManager().getClass().getMethod("canRequestPackageInstalls").invoke(getPackageManager());
            return Boolean.TRUE.equals(r);
        } catch (Exception e) {
            return true;
        }
    }

    private void updateJs(String call) {
        runJs("window.__" + call);
    }

    private void updateError(String code) {
        updateBusy = false;
        updateJs("onUpdateError && window.__onUpdateError(" + JSONObject.quote(code) + ")");
    }

    /** Scarica l'APK in cache/updates, ne controlla dimensione e SHA-256 (se noto) e apre l'installatore. */
    private void fetchUpdate(String url, String sha256) {
        HttpURLConnection c = null;
        InputStream in = null;
        FileOutputStream out = null;
        File dir = UpdateProvider.dir(this);
        File tmp = new File(dir, UpdateProvider.NAME + ".part");
        try {
            dir.mkdirs();
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) {
                updateError("network");
                return;
            }
            long total = c.getContentLength();
            in = c.getInputStream();
            out = new FileOutputStream(tmp);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[32768];
            long got = 0;
            int lastPct = -1;
            int n;
            while ((n = in.read(buf)) > 0) {
                if (updateCancelled) {
                    updateBusy = false;
                    return;
                }
                out.write(buf, 0, n);
                md.update(buf, 0, n);
                got += n;
                if (total > 0) {
                    int pct = (int) (got * 100 / total);
                    if (pct != lastPct) {
                        lastPct = pct;
                        updateJs("onUpdateProgress && window.__onUpdateProgress(" + pct + ")");
                    }
                }
            }
            out.close();
            out = null;
            if (got < 100000 || (total > 0 && got != total)) {
                updateError("size");
                return;
            }
            if (sha256 != null && sha256.length() == 64) {
                StringBuilder hex = new StringBuilder();
                for (byte b : md.digest()) {
                    hex.append(String.format(Locale.ROOT, "%02x", b));
                }
                if (!hex.toString().equalsIgnoreCase(sha256)) {
                    updateError("checksum");
                    return;
                }
            }
            File apk = UpdateProvider.apk(this);
            apk.delete();
            if (!tmp.renameTo(apk)) {
                updateError("size");
                return;
            }
            updateBusy = false;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    installUpdate();
                }
            });
        } catch (Exception e) {
            updateError("network");
        } finally {
            try {
                if (out != null) {
                    out.close();
                }
                if (in != null) {
                    in.close();
                }
            } catch (Exception ignored) {
                // niente da fare
            }
            if (c != null) {
                c.disconnect();
            }
            tmp.delete();
        }
    }

    /** Apre l'installatore di sistema sull'APK scaricato: l'utente conferma e Android sostituisce l'app (stessa firma). */
    private void installUpdate() {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse("content://" + UpdateProvider.AUTHORITY + "/" + UpdateProvider.NAME), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            updateJs("onUpdateReady && window.__onUpdateReady()");
        } catch (ActivityNotFoundException e) {
            updateError("installer");
        }
    }

    /** Il tasto indietro è gestito dalla pagina (chiude schermate/sessioni); esce solo dalla home. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__back ? window.__back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if ("true".equals(handled)) {
                    return;
                }
                long now = System.currentTimeMillis();
                if (now - lastBackAt < 2000) {
                    finish();
                } else {
                    lastBackAt = now;
                    Toast.makeText(MainActivity.this, "Premi di nuovo indietro per uscire", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (ttsReady) {
            tts.stop();
        }
        runJs("window.B && B.store && B.store.flush()"); // salva subito i progressi
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
