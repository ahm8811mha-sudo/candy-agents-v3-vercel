-- Keep repeated Company Brain materialization cycles idempotent. A source row
-- may be observed more than once, but the same feature observation must only
-- exist once for a tenant/entity/key/source/timestamp tuple.

delete from public.company_feature_values older
using public.company_feature_values newer
where older.ctid < newer.ctid
  and older.tenant_id = newer.tenant_id
  and older.entity_type = newer.entity_type
  and older.entity_id = newer.entity_id
  and older.feature_key = newer.feature_key
  and older.source = newer.source
  and older.observed_at = newer.observed_at;

create unique index if not exists company_feature_values_idempotency_idx
  on public.company_feature_values (
    tenant_id,
    entity_type,
    entity_id,
    feature_key,
    source,
    observed_at
  );

notify pgrst, 'reload schema';
