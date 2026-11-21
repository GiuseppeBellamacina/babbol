package it.babbol.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Scatta all'ora di un promemoria e mostra la notifica. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Reminders.show(context, intent.getStringExtra("title"), intent.getStringExtra("text"), intent.getIntExtra("code", 0));
    }
}
