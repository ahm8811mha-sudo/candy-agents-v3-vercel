create or replace function public.orvanta_redact_knowledge_node()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.attributes := public.orvanta_redact_company_json(coalesce(new.attributes, '{}'::jsonb));
  return new;
end;
$$;

revoke all on function public.orvanta_redact_company_json(jsonb) from public, anon, authenticated;
revoke all on function public.orvanta_redact_knowledge_node() from public, anon, authenticated;
grant execute on function public.orvanta_redact_company_json(jsonb) to service_role;
grant execute on function public.orvanta_redact_knowledge_node() to service_role;

notify pgrst, 'reload schema';
