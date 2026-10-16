-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Le funzioni sono chiamabili solo da utenti autenticati.
revoke execute on function public.get_course_changes(bigint) from public, anon;
revoke execute on function public.save_progress(jsonb, int) from public, anon;
revoke execute on function public.content_bump() from public, anon, authenticated;
grant execute on function public.get_course_changes(bigint) to authenticated;
grant execute on function public.save_progress(jsonb, int) to authenticated;
