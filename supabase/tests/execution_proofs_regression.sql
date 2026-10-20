\set ON_ERROR_STOP on

-- Rollback-only. Execution proofs seal on confirmation and can never outlive
-- their documents; a text-only confirmation still works exactly as before.
-- Every row written here belongs to a test tenant and is rolled back.

begin;

create function pg_temp.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_expected or sqlerrm like '%' || p_expected || '%' then
      return;
    end if;
    raise exception 'expected % from [%], got: %', p_expected, left(p_sql, 140), sqlerrm;
  end;
  raise exception 'expected % from [%], but it succeeded', p_expected, left(p_sql, 140);
end
$$;

do $$
declare
  v_tenant text := 'orvanta-proof-regression';
  v_project uuid := gen_random_uuid();
  v_draft uuid;
  v_other uuid;
  v_foreign uuid;
  v_empty uuid;
  v_discard uuid;
  v_task jsonb;
  v_meta jsonb;
  v_hashes jsonb;
  v_proof public.execution_proofs;
  v_count integer;
  v_mimes text[];
  v_status text := 'select public.orvanta_update_task_status(%L, %L, %L, %s, %L, %L, %L::boolean, %L, %L::uuid, %L::jsonb)';
begin
  insert into public.projects (id, tenant_id, name, request, status)
  values (v_project, v_tenant, 'Proof regression', 'Prove the seal', 'ACTIVE');
  insert into public.tasks (id, tenant_id, project_id, title, status, priority, metadata)
  select 'proof-regression-' || letter, v_tenant, v_project, 'Real-world step ' || letter, 'TODO', 'MEDIUM',
         '{"executionKind":"REAL_WORLD"}'::jsonb
  from unnest(array['a', 'b', 'c', 'd', 'e']) as letter;

  -- One open draft per step.
  insert into public.execution_proofs (tenant_id, task_id, created_by)
  values (v_tenant, 'proof-regression-a', 'regression') returning id into v_draft;
  perform pg_temp.expect_error(format(
    'insert into public.execution_proofs (tenant_id, task_id, created_by) values (%L, %L, %L)',
    v_tenant, 'proof-regression-a', 'regression'), '23505');

  -- Ten files, never eleven.
  insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading)
  select v_draft, v_tenant, v_tenant || '/a/' || v_draft || '/' || page, 'page-' || page || '.pdf', 'application/pdf',
         1000 + page, md5('a' || page) || md5('b' || page), jsonb_build_object('status', 'NOT_READ', 'page', page)
  from generate_series(1, 10) as page;
  perform pg_temp.expect_error(format(
    'insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading) values (%L, %L, %L, %L, %L, 1, %L, %L)',
    v_draft, v_tenant, 'eleventh', 'eleventh.pdf', 'application/pdf', md5('c') || md5('d'), '{}'), 'PROOF_FILE_LIMIT');

  -- The same bytes twice in one proof; a file under another tenant.
  insert into public.execution_proofs (tenant_id, task_id, created_by)
  values (v_tenant, 'proof-regression-b', 'regression') returning id into v_other;
  insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading)
  values (v_other, v_tenant, 'b-first', 'receipt.png', 'image/png', 10, md5('same') || md5('bytes'), '{}');
  perform pg_temp.expect_error(format(
    'insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading) values (%L, %L, %L, %L, %L, 10, %L, %L)',
    v_other, v_tenant, 'b-second', 'receipt-copy.png', 'image/png', md5('same') || md5('bytes'), '{}'), '23505');
  perform pg_temp.expect_error(format(
    'insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading) values (%L, %L, %L, %L, %L, 10, %L, %L)',
    v_other, 'someone-else', 'b-third', 'x.png', 'image/png', md5('e') || md5('f'), '{}'), 'PROOF_TENANT_MISMATCH');

  -- A file row never changes; a draft's identity never changes.
  perform pg_temp.expect_error(format(
    'update public.execution_proof_files set file_name = %L where proof_id = %L', 'renamed.png', v_other), 'PROOF_FILE_IMMUTABLE');
  perform pg_temp.expect_error(format(
    'update public.execution_proofs set task_id = %L where id = %L', 'proof-regression-c', v_other), 'PROOF_IDENTITY_IMMUTABLE');

  -- The confirmation refuses a proof that is not this step's, or has no files.
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-a', 'DONE', 100, 'owner', 'OWNER', false, null, v_draft, null),
    'PROOF_REQUIRES_CONFIRMATION');
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-c', 'DONE', 100, 'owner', 'OWNER', true,
    'مستند التسجيل مرفق بالكامل', v_other, null), 'PROOF_NOT_FOUND');
  insert into public.execution_proofs (tenant_id, task_id, created_by)
  values ('someone-else', 'proof-regression-c', 'regression') returning id into v_foreign;
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-c', 'DONE', 100, 'owner', 'OWNER', true,
    'مستند التسجيل مرفق بالكامل', v_foreign, null), 'PROOF_NOT_FOUND');
  insert into public.execution_proofs (tenant_id, task_id, created_by)
  values (v_tenant, 'proof-regression-c', 'regression') returning id into v_empty;
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-c', 'DONE', 100, 'owner', 'OWNER', true,
    'مستند التسجيل مرفق بالكامل', v_empty, null), 'PROOF_HAS_NO_FILES');
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-e', 'DONE', 100, 'owner', 'OWNER', true,
    'تم التنفيذ ومرجعه موجود', null, '{"reference":"x"}'), 'INVALID_PROOF_FACTS');

  -- Sealing: one call closes the step, seals the proof and freezes what the
  -- owner attested and the fingerprints the database holds.
  v_task := public.orvanta_update_task_status(v_tenant, 'proof-regression-a', 'DONE', 100, 'owner', 'OWNER', true,
    '  صدر السجل التجاري والمستندات مرفقة  ', v_draft, '{"reference":"1010"}'::jsonb);
  v_meta := v_task -> 'metadata';
  select jsonb_agg(sha256 order by created_at, id) into v_hashes from public.execution_proof_files where proof_id = v_draft;
  if v_task ->> 'status' <> 'DONE' or v_meta ->> 'proofVersion' <> '3' or (v_meta ->> 'proofId')::uuid <> v_draft
     or v_meta -> 'proofFacts' <> '{"reference":"1010"}'::jsonb or v_meta -> 'proofFileSha256s' <> v_hashes
     or jsonb_array_length(v_hashes) <> 10 or v_meta ->> 'ownerConfirmed' <> 'true' then
    raise exception 'sealing did not record the proof on the step: %', v_meta;
  end if;
  select * into v_proof from public.execution_proofs where id = v_draft;
  if v_proof.confirmed_at is null or v_proof.confirmed_by <> 'owner' or v_proof.note <> 'صدر السجل التجاري والمستندات مرفقة'
     or v_proof.facts_attested <> '{"reference":"1010"}'::jsonb or jsonb_array_length(v_proof.facts_read) <> 10 then
    raise exception 'the proof was not sealed as confirmed';
  end if;
  select count(*) into v_count from public.audit_log
  where tenant_id = v_tenant and entity_id = 'proof-regression-a' and action = 'CONFIRM_REAL_EXECUTION'
    and metadata ->> 'proofId' = v_draft::text and metadata -> 'proofFileSha256s' = v_hashes;
  if v_count <> 1 then
    raise exception 'the audit row does not carry the proof';
  end if;

  -- Sealed is sealed.
  perform pg_temp.expect_error(format('update public.execution_proofs set note = %L where id = %L', 'a later rewrite', v_draft), 'PROOF_SEALED');
  perform pg_temp.expect_error(format('delete from public.execution_proofs where id = %L', v_draft), 'PROOF_SEALED');
  perform pg_temp.expect_error(format('delete from public.execution_proof_files where proof_id = %L', v_draft), 'PROOF_SEALED');
  perform pg_temp.expect_error(format(
    'insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading) values (%L, %L, %L, %L, %L, 1, %L, %L)',
    v_draft, v_tenant, 'late', 'late.pdf', 'application/pdf', md5('g') || md5('h'), '{}'), 'PROOF_SEALED');

  -- A second press, and any re-confirmation over a sealed step, are refused
  -- without touching what was recorded.
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-a', 'DONE', 100, 'owner', 'OWNER', true,
    'ضغطة ثانية على التأكيد', v_draft, null), 'PROOF_ALREADY_SEALED');
  perform pg_temp.expect_error(format(v_status, v_tenant, 'proof-regression-a', 'DONE', 100, 'owner', 'OWNER', true,
    'تأكيد نصي فوق المختوم', null, null), 'PROOF_ALREADY_SEALED');
  select metadata into v_meta from public.tasks where id = 'proof-regression-a';
  if v_meta ->> 'proofVersion' <> '3' or (v_meta ->> 'proofId')::uuid <> v_draft then
    raise exception 'a refused re-confirmation changed the sealed step';
  end if;

  -- A text-only confirmation works exactly as before.
  v_task := public.orvanta_update_task_status(v_tenant, 'proof-regression-d', 'DONE', 100, 'owner', 'OWNER', true,
    'تم الدفع بإيصال رقم 77', null, null);
  if v_task -> 'metadata' ->> 'proofVersion' <> '2' or (v_task -> 'metadata') ? 'proofId' then
    raise exception 'a text-only confirmation is no longer proofVersion 2';
  end if;

  -- Reopening clears the step's link, never the seal; a new draft can open.
  v_task := public.orvanta_update_task_status(v_tenant, 'proof-regression-a', 'IN_PROGRESS', 50, 'owner', 'OWNER');
  v_meta := v_task -> 'metadata';
  if v_meta ? 'proofId' or v_meta ? 'proofVersion' or v_meta ? 'proofFileSha256s' or v_meta ? 'proofFacts' or v_meta ? 'ownerConfirmed' then
    raise exception 'reopening left the proof link on the step: %', v_meta;
  end if;
  if (select confirmed_at from public.execution_proofs where id = v_draft) is null then
    raise exception 'reopening unsealed the proof';
  end if;
  insert into public.execution_proofs (tenant_id, task_id, created_by) values (v_tenant, 'proof-regression-a', 'regression');

  -- A draft can be discarded, files first.
  insert into public.execution_proofs (tenant_id, task_id, created_by)
  values (v_tenant, 'proof-regression-e', 'regression') returning id into v_discard;
  insert into public.execution_proof_files (proof_id, tenant_id, storage_path, file_name, mime_type, size_bytes, sha256, reading)
  values (v_discard, v_tenant, 'e-only', 'only.webp', 'image/webp', 5, md5('i') || md5('j'), '{}');
  delete from public.execution_proof_files where proof_id = v_discard;
  delete from public.execution_proofs where id = v_discard;

  -- Client roles hold nothing; row level security is on.
  select count(*) into v_count from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('execution_proofs', 'execution_proof_files')
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_count <> 0 then
    raise exception 'client roles hold % grant(s) on the proof tables', v_count;
  end if;
  select count(*) into v_count from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('execution_proofs', 'execution_proof_files') and c.relrowsecurity;
  if v_count <> 2 then
    raise exception 'row level security is off on a proof table';
  end if;

  -- The bucket, where this role could create it, is private and bounded.
  if to_regclass('storage.buckets') is not null then
    select array(select unnest(allowed_mime_types) order by 1) into v_mimes from storage.buckets where id = 'execution-proofs';
    if found and v_mimes is not null and (
      (select public from storage.buckets where id = 'execution-proofs')
      or (select file_size_limit from storage.buckets where id = 'execution-proofs') <> 20971520
      or v_mimes <> array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    ) then
      raise exception 'the execution-proofs bucket is not private and bounded';
    end if;
  end if;
end
$$;

rollback;
