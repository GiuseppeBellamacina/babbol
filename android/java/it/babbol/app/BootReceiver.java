package it.babbol.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Dopo il riavvio del telefono le sveglie sono sparite: si riarmano quelle salvate. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Reminders.arm(context);
        }
    }
}
