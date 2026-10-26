import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type StoredCommand = {
  id: string;
  text: string;
  ownerAgentId: string;
  collaborators: string[];
  sopId: string | null;
  status: string;
  currentStep: string;
  blockers: string[];
  steps: unknown[];
  resultReport: string | null;
  spendApprovalId: string | null;
  taskId: string | null;
  diwan: { id: string | null; status: "OPEN" | "COMPLETED"; assigneeId: string; evidence: string | null; openedAt: string; closedAt: string | null };
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

const { rows } = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; tenant_id: string; payload: StoredCommand }>,
}));

vi.mock("../supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../supabase")>();
  return {
    ...actual,
    getSupabaseAdmin: () => ({
    from(table: string) {
      const state: { op: string; payload: Record<string, unknown> | null; filters: Record<string, string> } = {
        op: "",
        payload: null,
        filters: {},
      };
      const api = {
        upsert(payload: Record<string, unknown>) {
          state.op = "upsert";
          state.payload = payload;
          return api;
        },
        insert() {
          state.op = "insert";
          return api;
        },
        select() {
          if (!state.op) state.op = "select";
          return api;
        },
        eq(key: string, value: string) {
          state.filters[key] = value;
          return api;
        },
        limit() {
          return api;
        },
        single() {
          return api;
        },
        order() {
          return api;
        },
        not() {
          return api;
        },
        range() {
          return api;
        },
        gte() {
          return api;
        },
        is() {
          return api;
        },
        then(resolve: (value: { data: unknown; error: { message: string; code: string } | null }) => unknown) {
          if (table === "chairman_commands" && state.op === "upsert" && state.payload) {
            const record = {
              id: String(state.payload.id),
              tenant_id: String(state.payload.tenant_id),
              payload: JSON.parse(JSON.stringify(state.payload.payload)) as StoredCommand,
            };
            const index = rows.findIndex((row) => row.id === record.id);
            if (index === -1) rows.push(record);
            else rows[index] = record;
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          if (table === "chairman_commands" && state.op === "select") {
            const data = rows
              .filter((row) => !state.filters.tenant_id || row.tenant_id === state.filters.tenant_id)
              .map((row) => ({ payload: row.payload }));
            return Promise.resolve({ data, error: null }).then(resolve);
          }
          if (state.op === "select") return Promise.resolve({ data: [], error: null }).then(resolve);
          return Promise.resolve({ data: null, error: { message: "table unavailable in test", code: "42P01" } }).then(resolve);
        },
      };
      return api;
    },
    }),
  };
});

import { GET as listCommands } from "@/app/api/commands/route";
import { GET as pollCommands } from "@/app/api/bridge/commands/route";
import { GET as agentInbox } from "@/app/api/bridge/agents/[agentKey]/inbox/route";
import { _clearChairmanCommands, hydrateChairmanCommands, issueChairmanCommand } from "./chairmanCommands";

const MASTER = "persist-test-master-key";

function foreignCommand(id: string, updatedAt: string): StoredCommand {
  return {
    id,
    text: "مقارنة موردين كُتبت في نسخة أخرى",
    ownerAgentId: "khalid",
    collaborators: ["fahad"],
    sopId: null,
    status: "IN_PROGRESS",
    currentStep: "جمع العروض",
    blockers: [],
    steps: [],
    resultReport: null,
    spendApprovalId: null,
    taskId: null,
    diwan: { id: null, status: "OPEN", assigneeId: "khalid", evidence: null, openedAt: updatedAt, closedAt: null },
    dueAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    closedAt: null,
  };
}

describe("chairman commands survive another instance", () => {
  beforeEach(() => {
    rows.length = 0;
    _clearChairmanCommands();
    process.env.AGENT_BRIDGE_KEY = MASTER;
  });

  it("reloads a command written here into GET /api/commands and the employee inbox", async () => {
    const issued = await issueChairmanCommand("خالد: جهّز مقارنة الموردين وأرسلها للمورد");
    expect(rows.map((row) => row.id)).toContain(issued.id);
    _clearChairmanCommands();

    const board = await listCommands();
    const boardJson = await board.json();
    expect(boardJson.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: issued.id, ownerAgentId: "khalid", status: "AWAITING_CHAIRMAN" }),
    ]));

    const inbox = await agentInbox(
      new NextRequest("http://localhost/api/bridge/agents/khalid/inbox", {
        headers: { "x-agent-bridge-key": MASTER },
      }),
      { params: Promise.resolve({ agentKey: "khalid" }) },
    );
    const inboxJson = await inbox.json();
    expect(inboxJson.inbox.commands.map((item: { id: string }) => item.id)).toContain(issued.id);
  });

  it("picks up a row inserted after this process already hydrated", async () => {
    await hydrateChairmanCommands();
    const updatedAt = new Date().toISOString();
    rows.push({ id: "cmd-foreign", tenant_id: "golden-star", payload: foreignCommand("cmd-foreign", updatedAt) });

    const since = new Date(Date.now() - 60_000).toISOString();
    const poll = await pollCommands(new NextRequest(`http://localhost/api/bridge/commands?since=${encodeURIComponent(since)}`, {
      headers: { "x-agent-bridge-key": MASTER },
    }));
    const pollJson = await poll.json();
    expect(pollJson.commands).toEqual([
      expect.objectContaining({ id: "cmd-foreign", ownerAgentId: "khalid", status: "IN_PROGRESS" }),
    ]);

    const inbox = await agentInbox(
      new NextRequest("http://localhost/api/bridge/agents/khalid/inbox", {
        headers: { "x-agent-bridge-key": MASTER },
      }),
      { params: Promise.resolve({ agentKey: "khalid" }) },
    );
    expect((await inbox.json()).inbox.commands.map((item: { id: string }) => item.id)).toContain("cmd-foreign");
  });

  it("keeps the newer copy when memory and the database disagree", async () => {
    const issued = await issueChairmanCommand("خالد: جهّز مقارنة الموردين وأرسلها للمورد");
    const row = rows.find((item) => item.id === issued.id)!;
    row.payload = { ...row.payload, ownerAgentId: "sara", updatedAt: "2000-01-01T00:00:00.000Z" };
    await hydrateChairmanCommands();
    const board = await (await listCommands()).json();
    expect(board.commands.find((item: { id: string }) => item.id === issued.id).ownerAgentId).toBe("khalid");

    row.payload = { ...row.payload, ownerAgentId: "fahad", currentStep: "من القاعدة", updatedAt: "2099-01-01T00:00:00.000Z" };
    await hydrateChairmanCommands();
    const refreshed = await (await listCommands()).json();
    expect(refreshed.commands.find((item: { id: string }) => item.id === issued.id)).toMatchObject({
      ownerAgentId: "fahad",
      currentStep: "من القاعدة",
    });
  });
});
