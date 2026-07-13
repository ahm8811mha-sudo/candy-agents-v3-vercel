-- Security hardening for accounting trigger functions.
-- Trigger functions do not need SECURITY DEFINER or direct RPC access.

alter function public.orvanta_guard_journal_entry() security invoker;
alter function public.orvanta_guard_journal_line() security invoker;

revoke all on function public.orvanta_guard_journal_entry() from public, anon, authenticated;
revoke all on function public.orvanta_guard_journal_line() from public, anon, authenticated;

notify pgrst, 'reload schema';
