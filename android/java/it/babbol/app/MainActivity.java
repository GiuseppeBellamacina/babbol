package it.babbol.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
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
            tts.setVoice(pool.get(Math.abs(variant) % pool.size()));
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
