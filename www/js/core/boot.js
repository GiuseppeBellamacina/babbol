/* Namespace globale + configurazione. Va caricato per primo. */
window.B = {
  VERSION: "1.0",
  config: {
    // Progetto Supabase "babbol". La chiave è quella pubblica (publishable): i dati sono protetti dalle regole RLS.
    supabaseUrl: "https://xmitklupdqpnzcviimvx.supabase.co",
    supabaseKey: "sb_publishable_FmjjFJuT5yKO9AoVpfqT-g_DFHrF1TB",
    authRedirect: "babbol://auth-callback",
    contentCheckHours: 24,       // controllo aggiornamenti dei contenuti al massimo una volta al giorno
    syncMinSeconds: 180          // salvataggio progressi al massimo ogni 3 minuti (salvo uscita/logout)
  },
  data: {}
};
