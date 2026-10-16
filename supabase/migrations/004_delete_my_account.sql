-- DA APPLICARE A MANO: incollare nel SQL Editor del dashboard Supabase (progetto "babbol") ed eseguire.
-- (Il server MCP blocca le istruzioni che cancellano utenti, quindi non è stato possibile applicarla da lì.)
--
-- Cancellazione dell'account da parte dell'utente stesso (richiesta da Google Play per le app con account).
-- I progressi spariscono in cascata (user_progress.user_id ... on delete cascade).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
