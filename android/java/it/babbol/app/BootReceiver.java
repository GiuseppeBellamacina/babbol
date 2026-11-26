package it.babbol.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Le sveglie spariscono con il riavvio del telefono e con l'aggiornamento dell'app, e cambiano ora reale se cambia il fuso
 * o l'orologio: in tutti questi casi si riarmano quelle salvate (nessun lavoro in background, scatta solo a quegli eventi).
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a)) {
            Reminders.arm(context);
        }
    }
}
