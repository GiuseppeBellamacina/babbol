-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- issue_reports: nessun accesso diretto (si scrive solo con report_issue, si legge dal dashboard).
create policy issue_reports_no_direct on public.issue_reports for all to authenticated using (false) with check (false);
