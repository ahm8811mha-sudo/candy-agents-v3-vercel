create or replace function public.orvanta_redact_company_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb;
  v_key text;
  v_item jsonb;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_item in select key, value from jsonb_each(p_value)
    loop
      if v_key ~* '(password|secret|token|authorization|cookie|otp|session|credential|api[_-]?key|private[_-]?key|code[_-]?verifier)' then
        v_result := v_result || jsonb_build_object(v_key, '[REDACTED]');
      else
        v_result := v_result || jsonb_build_object(v_key, public.orvanta_redact_company_json(v_item));
      end if;
    end loop;
    return v_result;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(public.orvanta_redact_company_json(value)), '[]'::jsonb)
      into v_result
    from jsonb_array_elements(p_value);
    return v_result;
  end if;

  if jsonb_typeof(p_value) = 'string' and length(trim(both '"' from p_value::text)) > 4000 then
    return to_jsonb(left(trim(both '"' from p_value::text), 4000) || '…');
  end if;

  return p_value;
end;
$$;

create or replace function public.orvanta_redact_knowledge_node()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.attributes := public.orvanta_redact_company_json(coalesce(new.attributes, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists trg_redact_company_knowledge_node on public.company_knowledge_nodes;
create trigger trg_redact_company_knowledge_node
before insert or update of attributes on public.company_knowledge_nodes
for each row execute function public.orvanta_redact_knowledge_node();

revoke all on function public.orvanta_redact_company_json(jsonb) from public, anon, authenticated;
revoke all on function public.orvanta_redact_knowledge_node() from public, anon, authenticated;
grant execute on function public.orvanta_redact_company_json(jsonb) to service_role;
grant execute on function public.orvanta_redact_knowledge_node() to service_role;

update public.company_knowledge_nodes
set attributes = public.orvanta_redact_company_json(attributes), updated_at = now();

notify pgrst, 'reload schema';
