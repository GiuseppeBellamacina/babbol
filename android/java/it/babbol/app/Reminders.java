package it.babbol.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Promemoria locali (nessun server): la pagina calcola i prossimi giorni e li passa a scheduleReminders(json),
 * una lista di { at: millisecondi, title, text }. Le sveglie sono inesatte (setAndAllowWhileIdle): l'ora può slittare un po',
 * ma non serve il permesso delle sveglie esatte. Dopo il riavvio le riarma BootReceiver dalle SharedPreferences.
 *
 * La toolchain di build compila contro android.jar API 23: ciò che esiste solo da Android 7/8 (canale delle notifiche,
 * areNotificationsEnabled) si chiama per riflessione e fallisce in silenzio.
 */
final class Reminders {
    static final int MAX = 16;            // codici richiesta 0..15 per i promemoria, 99 per la prova
    private static final int TEST_CODE = 99;
    private static final String PREFS = "reminders";
    private static final String KEY = "list";
    private static final String CHANNEL = "promemoria";

    private Reminders() { }

    static void schedule(Context c, String json) {
        cancelAlarms(c);
        try {
            JSONArray in = new JSONArray(json);
            JSONArray keep = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < in.length() && keep.length() < MAX; i++) {
                JSONObject o = in.getJSONObject(i);
                if (o.getLong("at") > now) {
                    keep.put(o);
                }
            }
            prefs(c).edit().putString(KEY, keep.toString()).apply();
        } catch (Exception e) {
            prefs(c).edit().remove(KEY).apply();
        }
        arm(c);
    }

    static void cancel(Context c) {
        cancelAlarms(c);
        prefs(c).edit().remove(KEY).apply();
    }

    /** Arma le sveglie dei promemoria salvati che sono ancora nel futuro (all'avvio del telefono e dopo schedule). */
    static void arm(Context c) {
        try {
            JSONArray list = new JSONArray(prefs(c).getString(KEY, "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < list.length() && i < MAX; i++) {
                JSONObject o = list.getJSONObject(i);
                if (o.getLong("at") > now) {
                    set(c, i, o.getLong("at"), o.optString("title", "Babbol"), o.optString("text", ""));
                }
            }
        } catch (Exception e) {
            // niente da armare
        }
    }

    /** Notifica di prova tra qualche secondo, senza toccare i promemoria salvati. */
    static void test(Context c, String title, String text, int seconds) {
        set(c, TEST_CODE, System.currentTimeMillis() + seconds * 1000L, title, text);
    }

    static boolean allowed(Context c) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 24) {
                return (Boolean) NotificationManager.class.getMethod("areNotificationsEnabled").invoke(nm);
            }
        } catch (Exception e) {
            // si presume di sì
        }
        return true;
    }

    private static void set(Context c, int code, long at, String title, String text) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent in = new Intent(c, ReminderReceiver.class);
        in.putExtra("title", title);
        in.putExtra("text", text);
        in.putExtra("code", code);
        PendingIntent pi = PendingIntent.getBroadcast(c, code, in, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void cancelAlarms(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        for (int code = 0; code < MAX; code++) {
            PendingIntent pi = PendingIntent.getBroadcast(c, code, new Intent(c, ReminderReceiver.class),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
    }

    /** Mostra la notifica (chiamata da ReminderReceiver). Il tocco apre l'app. */
    static void show(Context c, String title, String text, int code) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b = new Notification.Builder(c);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Class<?> chCls = Class.forName("android.app.NotificationChannel");
                Object ch = chCls.getConstructor(String.class, CharSequence.class, int.class).newInstance(CHANNEL, "Promemoria di studio", 3);
                NotificationManager.class.getMethod("createNotificationChannel", chCls).invoke(nm, ch);
                Notification.Builder.class.getMethod("setChannelId", String.class).invoke(b, CHANNEL);
            }
        } catch (Exception e) {
            // senza canale su Android 8+ la notifica non compare, ma l'app resta stabile
        }
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true);
        nm.notify(1000 + code, b.build());
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
