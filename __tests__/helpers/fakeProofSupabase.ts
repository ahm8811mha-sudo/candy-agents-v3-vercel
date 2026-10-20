/**
 * An in-memory stand-in for the slice of the Supabase client the proof store
 * uses. It enforces what the real database enforces for these tables
 * (20261018000200_execution_proofs.sql): one open draft per step, ten files,
 * unique fingerprints per proof, sealed proofs, tenant on every file. A file
 * row may be deleted only while its proof is a draft; nothing else is ever
 * updated or deleted.
 */

type Row = Record<string, any>;
type Filter = { kind: "eq" | "is"; column: string; value: unknown };

function readColumn(row: Row, column: string) {
  const json = column.match(/^(\w+)->>(\w+)$/);
  if (json) return row[json[1]]?.[json[2]] == null ? null : String(row[json[1]][json[2]]);
  return row[column];
}

export function createFakeProofSupabase() {
  const tables: Record<string, Row[]> = { tasks: [], execution_proofs: [], execution_proof_files: [], company_approvals: [], gov_document_files: [] };
  const objects = new Map<string, Uint8Array>();
  const buckets = new Map<string, { public: boolean }>();
  const calls: string[] = [];
  let clock = 0;

  const conflict = (constraint: string) => ({ code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` });
  const raised = (message: string) => ({ code: "P0001", message });

  function insertRow(table: string, input: Row): { data: Row | null; error: any } {
    const row: Row = { id: input.id ?? `${table}-${tables[table].length + 1}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date(Date.UTC(2026, 9, 20, 0, 0, clock++)).toISOString(), ...input };
    if (table === "execution_proofs") {
      if (tables.execution_proofs.some((p) => p.tenant_id === row.tenant_id && p.task_id === row.task_id && !p.confirmed_at)) {
        return { data: null, error: conflict("execution_proofs_one_open_draft") };
      }
      row.confirmed_at ??= null;
    }
    if (table === "execution_proof_files") {
      const proof = tables.execution_proofs.find((p) => p.id === row.proof_id);
      if (proof?.confirmed_at) return { data: null, error: raised("PROOF_SEALED") };
      if (row.tenant_id !== proof?.tenant_id) return { data: null, error: raised("PROOF_TENANT_MISMATCH") };
      const siblings = tables.execution_proof_files.filter((f) => f.proof_id === row.proof_id);
      if (siblings.length >= 10) return { data: null, error: raised("PROOF_FILE_LIMIT") };
      if (siblings.some((f) => f.sha256 === row.sha256)) return { data: null, error: conflict("execution_proof_files_proof_id_sha256_key") };
      if (tables.execution_proof_files.some((f) => f.storage_path === row.storage_path)) return { data: null, error: conflict("execution_proof_files_storage_path_key") };
    }
    tables[table].push(row);
    return { data: row, error: null };
  }

  function query(table: string) {
    calls.push(`from:${table}`);
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    let countOnly = false;
    const matches = () => (tables[table] || []).filter((row) => filters.every((f) => (f.kind === "is" ? (row[f.column] ?? null) === f.value : readColumn(row, f.column) === (f.value == null ? null : String(f.value)))));
    const run = () => {
      if (mode === "insert") return insertRow(table, payload!);
      if (mode === "delete" && table === "execution_proof_files") {
        calls.push(`delete:${table}`);
        const doomed = matches();
        if (doomed.some((file) => tables.execution_proofs.find((p) => p.id === file.proof_id)?.confirmed_at)) return { data: null, error: raised("PROOF_SEALED") };
        tables[table] = tables[table].filter((row) => !doomed.includes(row));
        return { data: doomed, error: null };
      }
      if (mode === "update" || mode === "delete") {
        calls.push(`${mode}:${table}`);
        return { data: null, error: { message: `the proof store must never ${mode} ${table}` } };
      }
      const rows = matches().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
      // A read is a snapshot, as from a real database: later changes to the
      // table do not reach a row already returned.
      return countOnly ? { data: null, error: null, count: rows.length } : { data: rows.map((row) => ({ ...row })), error: null };
    };
    const builder: any = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) { if (options?.head) countOnly = true; return builder; },
      insert(row: Row) { mode = "insert"; payload = row; return builder; },
      update(row: Row) { mode = "update"; payload = row; return builder; },
      delete() { mode = "delete"; return builder; },
      eq(column: string, value: unknown) { filters.push({ kind: "eq", column, value }); return builder; },
      is(column: string, value: unknown) { filters.push({ kind: "is", column, value }); return builder; },
      order() { return builder; },
      limit() { return builder; },
      async maybeSingle() { const result: any = run(); if (result.error) return result; const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data; return { data, error: null }; },
      async single() { const result: any = run(); if (result.error) return result; const data = Array.isArray(result.data) ? result.data[0] : result.data; return data ? { data, error: null } : { data: null, error: { message: "no rows" } }; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  }

  const client = {
    from: query,
    rpc: (name: string) => { calls.push(`rpc:${name}`); return Promise.resolve({ data: null, error: { message: "the proof store never calls an rpc" } }); },
    storage: {
      async getBucket(id: string) { const bucket = buckets.get(id); return bucket ? { data: { id, public: bucket.public }, error: null } : { data: null, error: { message: "Bucket not found" } }; },
      async createBucket(id: string, options: { public: boolean }) { calls.push(`createBucket:${id}:${options.public}`); buckets.set(id, { public: options.public }); return { data: { name: id }, error: null }; },
      async updateBucket(id: string, options: { public: boolean }) { calls.push(`updateBucket:${id}:${options.public}`); buckets.set(id, { public: options.public }); return { data: null, error: null }; },
      from(bucket: string) {
        return {
          async createSignedUploadUrl(path: string) { calls.push(`slot:${path}`); return { data: { path, token: `token-for-${path}`, signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t` }, error: null }; },
          async download(path: string) { calls.push(`download:${path}`); const bytes = objects.get(`${bucket}/${path}`); return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "Object not found" } }; },
          async remove(paths: string[]) { for (const path of paths) { calls.push(`remove:${path}`); objects.delete(`${bucket}/${path}`); } return { data: [], error: null }; },
          async createSignedUrl(path: string, expiresIn: number) { calls.push(`signedUrl:${path}:${expiresIn}`); return { data: { signedUrl: `https://storage.test/sign/${bucket}/${path}?expires=${expiresIn}` }, error: null }; },
        };
      },
    },
  };

  return {
    client,
    tables,
    calls,
    buckets,
    putObject: (bucket: string, path: string, bytes: Uint8Array) => objects.set(`${bucket}/${path}`, bytes),
    hasObject: (bucket: string, path: string) => objects.has(`${bucket}/${path}`),
    seal: (proofId: string) => { const proof = tables.execution_proofs.find((p) => p.id === proofId)!; proof.confirmed_at = "2026-10-20T10:00:00Z"; proof.confirmed_by = "owner"; },
  };
}
