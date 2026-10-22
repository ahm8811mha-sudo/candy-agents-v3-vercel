-- Journal amounts carry an explicit scale, numeric(18,2), as
-- 202607150002_accounting_core_baseline.sql intended. Production kept plain
-- numeric: Postgres will not retype a column a view reads, and
-- accounting_trial_balance_v (202607130004) reads both. The production
-- replay of 2026-10-22 found the two columns unscaled.
--
-- The view is set aside for the change and recreated from its own stored
-- definition, with the same grants. An amount is never rounded silently: if
-- any line carries more than two decimals, this stops and says how many.

do $$
declare
  v_view regclass := to_regclass('public.accounting_trial_balance_v');
  v_definition text;
  v_grants text[];
  v_grant text;
  v_unscaled integer;
begin
  if to_regclass('public.accounting_journal_lines') is null then
    return;
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'accounting_journal_lines'
         and column_name in ('debit', 'credit') and numeric_precision = 18 and numeric_scale = 2) = 2 then
    return;
  end if;

  select count(*) into v_unscaled from public.accounting_journal_lines
   where debit <> round(debit, 2) or credit <> round(credit, 2);
  if v_unscaled > 0 then
    raise exception '% journal lines carry more than two decimals; review them before the scale is fixed', v_unscaled;
  end if;

  if v_view is not null then
    v_definition := pg_get_viewdef(v_view);
    select array_agg(format('grant %s on public.accounting_trial_balance_v to %s', a.privilege_type, a.grantee::regrole))
      into v_grants
      from pg_class c, aclexplode(c.relacl) a
     where c.oid = v_view and a.grantee <> 0 and a.grantee <> c.relowner;
    drop view public.accounting_trial_balance_v;
  end if;

  alter table public.accounting_journal_lines
    alter column debit type numeric(18,2),
    alter column credit type numeric(18,2);

  if v_definition is not null then
    execute 'create view public.accounting_trial_balance_v as ' || v_definition;
    revoke all on public.accounting_trial_balance_v from public, anon, authenticated;
    foreach v_grant in array coalesce(v_grants, '{}') loop
      execute v_grant;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
