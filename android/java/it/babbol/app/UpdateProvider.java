package it.babbol.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Espone all'installatore di sistema l'unico file che serve: l'APK dell'aggiornamento scaricato
 * (cache/updates/babbol.apk), all'indirizzo content://it.babbol.app.updates/babbol.apk.
 * Sostituisce FileProvider di AndroidX, che qui non è disponibile. Non è esportato: l'installatore
 * può leggerlo solo grazie al permesso temporaneo concesso con l'intent (FLAG_GRANT_READ_URI_PERMISSION).
 */
public class UpdateProvider extends ContentProvider {

    public static final String AUTHORITY = "it.babbol.app.updates";
    public static final String NAME = "babbol.apk";

    /** Cartella e file dell'aggiornamento (usati anche da MainActivity per scaricare). */
    public static File dir(android.content.Context c) {
        return new File(c.getCacheDir(), "updates");
    }

    public static File apk(android.content.Context c) {
        return new File(dir(c), NAME);
    }

    private File target(Uri uri) throws FileNotFoundException {
        // solo il file previsto, niente percorsi liberi
        if (!("/" + NAME).equals(uri.getPath())) {
            throw new FileNotFoundException("not found");
        }
        File f = apk(getContext());
        if (!f.isFile()) {
            throw new FileNotFoundException("not found");
        }
        return f;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(target(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File f = target(uri);
            MatrixCursor c = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[] {NAME, Long.valueOf(f.length())});
            return c;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("read only");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("read only");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("read only");
    }
}
