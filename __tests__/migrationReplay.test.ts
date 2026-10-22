import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { replayHazards, splitStatements } from "../lib/release/sqlStatements.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { changedKeys, describeWrites, judgeReplay, repairLedgerByReplay } from "../lib/release/migrationReplay.mjs";

type Statement = { code: string; keyword: string; line: number };
type Replayed = { file: string; version: string; error: string | null; changed: string[] };

describe("splitting a migration into top-level statements", () => {
  it("ends a statement only at a top-level semicolon", () => {
    const sql = [
      "create table t (note text default 'a;b', \"odd;name\" int); -- trailing; comment",
      "/* block; /* nested; */ still comment; */",
      "create function f() returns void language plpgsql as $$",
      "begin",
      "  perform 1;",
      "end;",
      "$$;",
      "do $body$ begin raise notice 'x;y'; end $body$;",
      "select E'it\\'s; fine', 'it''s; fine', $1;",
    ].join("\n");
    const statements: Statement[] = splitStatements(sql);
    expect(statements.map((statement) => [statement.keyword, statement.line])).toEqual([["create", 1], ["create", 3], ["do", 8], ["select", 9]]);
    expect(statements[1].code).toContain("end;\n$$");
  });

  it("refuses a body or string that never closes", () => {
    expect(() => splitStatements("do $$ begin end;")).toThrow(/unterminated \$\$ body at line 1/);
    expect(() => splitStatements("select 'open;")).toThrow(/unterminated string/);
  });
});

describe("what can be replayed and rolled back", () => {
  it("refuses transaction control and session settings at the top level", () => {
    expect(replayHazards("create table t (id int);\ncommit;")).toEqual(["line 2: top-level commit"]);
    expect(replayHazards("begin;\nend;")).toEqual(["line 1: top-level begin", "line 2: top-level end"]);
    expect(replayHazards("set search_path = public;\nvacuum t;")).toEqual(["line 1: top-level set", "line 2: top-level vacuum"]);
  });

  it("allows the same words inside a function body or as a function attribute", () => {
    const sql = "create or replace function f() returns void language plpgsql\nset search_path = public\nas $$ begin commit; end; $$;";
    expect(replayHazards(sql)).toEqual([]);
  });

  it("refuses calls a rollback does not undo, wherever they sit", () => {
    expect(replayHazards("do $$ begin perform nextval('s'); end $$;")).toEqual(["line 1: nextval() is not undone by a rollback"]);
    expect(replayHazards("select net.http_post('https://example.invalid');")).toHaveLength(1);
    expect(replayHazards("select cron.schedule('x', '* * * * *', 'select 1');")).toHaveLength(1);
    expect(replayHazards("select pg_advisory_xact_lock(1);")).toEqual([]);
  });

  it("finds every repository migration replayable", () => {
    for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"))) {
      expect([file, replayHazards(readFileSync(`supabase/migrations/${file}`, "utf8"))]).toEqual([file, []]);
    }
  });

  // A second run of `create policy p` or `create trigger t` fails unless the
  // same file dropped it first, and a migration that fails its replay is
  // never recorded.
  it("drops every policy and trigger before creating it, so a second run succeeds", () => {
    const name = (raw: string) => raw.replace(/"/g, "").toLowerCase();
    for (const file of readdirSync("supabase/migrations").filter((entry) => entry.endsWith(".sql"))) {
      const statements: Statement[] = splitStatements(readFileSync(`supabase/migrations/${file}`, "utf8"));
      const dropped = new Set<string>();
      for (const { code } of statements) {
        const drop = /^drop\s+(policy|trigger)\s+if\s+exists\s+("[^"]+"|\w+)\s+on\s+([\w."]+)/i.exec(code);
        if (drop) dropped.add(`${drop[1].toLowerCase()} ${name(drop[2])} ${name(drop[3]).split(".").pop()}`);
        const create = /^create\s+(policy|trigger)\s+("[^"]+"|\w+)[\s\S]*?\bon\s+([\w."]+)/i.exec(code);
        if (create) expect([file, dropped.has(`${create[1].toLowerCase()} ${name(create[2])} ${name(create[3]).split(".").pop()}`)]).toEqual([file, true]);
      }
    }
  });
});

describe("reading what a replay changed", () => {
  it("names objects added, removed or defined differently", () => {
    const before = new Map([["index public.a", "x"], ["policy public.t.p", "using=true"], ["column public.t.c", "text"]]);
    const after = new Map([["index public.a", "x"], ["policy public.t.p", "using=false"], ["index public.b", "y"]]);
    expect(changedKeys(before, after)).toEqual(["column public.t.c", "index public.b", "policy public.t.p"]);
  });

  it("counts the rows written between two readings, table by table", () => {
    const before = new Map([["public.a", [1, 0, 0]]]);
    const after = new Map([["public.a", [3, 0, 0]], ["public.b", [0, 4, 1]], ["public.c", [0, 0, 0]]]);
    expect(describeWrites(before, after)).toBe("public.a +2, public.b ~4 -1");
  });
});

describe("deciding which missing migrations the replay clears", () => {
  const entry = (file: string, over: Partial<Replayed> = {}): Replayed => ({ file, version: file.split("_")[0], error: null, changed: [], ...over });

  it("records a migration whose replay changed nothing that lasted", () => {
    const replayed = [
      entry("1_create.sql", { changed: ["function public.f()"] }),
      entry("2_replace.sql", { changed: ["function public.f()"] }),
    ];
    const result = judgeReplay({ missing: ["1", "2"], recorded: new Set(), replayed, lasting: new Set() });
    expect(result.verified.map((item: { version: string }) => item.version)).toEqual(["1", "2"]);
    expect(result.unrecorded).toEqual([]);
  });

  it("leaves out a migration that failed, or whose change outlived the chain", () => {
    const replayed = [
      entry("1_ok.sql"),
      entry("2_fails.sql", { error: 'relation "public.t" does not exist' }),
      entry("3_missing_index.sql", { changed: ["index public.i", "column public.t.c"] }),
    ];
    const result = judgeReplay({ missing: ["1", "2", "3"], recorded: new Set(), replayed, lasting: new Set(["index public.i"]) });
    expect(result.verified.map((item: { version: string }) => item.version)).toEqual(["1"]);
    expect(result.unrecorded).toEqual(["2", "3"]);
    expect(result.blocked.map((item: { reasons: string[] }) => item.reasons)).toEqual([
      ['its replay failed: relation "public.t" does not exist'],
      ["its replay changes what the database lacks or holds differently: index public.i"],
    ]);
  });

  it("records a version two files share only when both are clear", () => {
    const replayed = [entry("5_a.sql"), entry("5_b.sql", { changed: ["policy public.t.p"] })];
    const result = judgeReplay({ missing: ["5"], recorded: new Set(), replayed, lasting: new Set(["policy public.t.p"]) });
    expect(result.verified).toEqual([]);
    expect(result.unrecorded).toEqual(["5"]);
  });

  it("notes a migration already in the ledger whose replay still changes something", () => {
    const replayed = [entry("7_recorded.sql", { changed: ["relation public.t"] })];
    const result = judgeReplay({ missing: [], recorded: new Set(["7"]), replayed, lasting: new Set(["relation public.t"]) });
    expect(result.notes).toHaveLength(1);
    expect(result.unrecorded).toEqual([]);
  });
});

describe("repairing the ledger", () => {
  const fake = (ledger: string[]) => {
    const queries: string[] = [];
    return {
      queries,
      async query(text: string) {
        queries.push(text);
        if (text.includes("from supabase_migrations.schema_migrations")) return { rows: ledger.map((version) => ({ version, name: "" })) };
        return { rows: [] };
      },
    };
  };

  it("does nothing when every version is already recorded", async () => {
    const db = fake(["1"]);
    const result = await repairLedgerByReplay(db, { files: [{ file: "1_a.sql", sql: "select 1;" }], log: () => {} });
    expect(result).toEqual({ recorded: [], unrecorded: [] });
    expect(db.queries).toHaveLength(1);
  });

  it("refuses to replay a chain holding transaction control, and records nothing", async () => {
    const db = fake([]);
    const lines: string[] = [];
    const files = [{ file: "1_a.sql", sql: "create table t (id int);" }, { file: "2_b.sql", sql: "insert into t values (1);\ncommit;" }];
    const result = await repairLedgerByReplay(db, { files, log: (line: string) => lines.push(line) });
    expect(result).toEqual({ recorded: [], unrecorded: ["1", "2"] });
    expect(db.queries).toHaveLength(1);
    expect(lines).toContain("replay refused: 2_b.sql: line 2: top-level commit");
  });
});
