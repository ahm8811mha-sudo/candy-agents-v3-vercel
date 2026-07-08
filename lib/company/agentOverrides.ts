/**
 * Roadmap #5 — Customizable agents.
 *
 * The static registry in agents.ts stays the structural source of truth
 * (ranks, authority, reporting lines — governance never becomes editable),
 * while the owner can rename an agent, retitle them, or deactivate them.
 * Overrides follow the platform persistence pattern: in-memory working copy,
 * write-through to the `agent_overrides` table, hydrate once per process.
 */

import { persist, fetchRows, hydrateOnce } from "../supabase";
import { COMPANY_AGENTS, type CompanyAgent } from "./agents";

export type AgentOverride = {
  agentId: string;
  name?: string;
  title?: string;
  active?: boolean;
  updatedAt: string;
};

const overrides = new Map<string, AgentOverride>();

export const hydrateAgentOverrides = hydrateOnce(async () => {
  const rows = await fetchRows("agent_overrides", { orderBy: "updated_at", limit: 100 });
  for (const r of rows) {
    const agentId = String(r.agent_id);
    if (overrides.has(agentId)) continue;
    overrides.set(agentId, {
      agentId,
      name: r.name ? String(r.name) : undefined,
      title: r.title ? String(r.title) : undefined,
      active: r.active === null || r.active === undefined ? undefined : Boolean(r.active),
      updatedAt: String(r.updated_at),
    });
  }
});

export type SetOverrideInput = { agentId: string; name?: string; title?: string; active?: boolean };

/** The owner cannot be renamed away or deactivated — governance anchor. */
export function setAgentOverride(input: SetOverrideInput): AgentOverride | null {
  const base = COMPANY_AGENTS.find((a) => a.id === input.agentId);
  if (!base) return null;
  if (base.rank === "OWNER") return null;

  const current = overrides.get(input.agentId);
  const next: AgentOverride = {
    agentId: input.agentId,
    name: input.name?.trim() || current?.name,
    title: input.title?.trim() || current?.title,
    active: input.active ?? current?.active,
    updatedAt: new Date().toISOString(),
  };
  overrides.set(input.agentId, next);
  persist(
    "agent_overrides",
    {
      agent_id: next.agentId,
      name: next.name ?? null,
      title: next.title ?? null,
      active: next.active ?? true,
      updated_at: next.updatedAt,
    },
    "agent_id"
  );
  return next;
}

export function clearAgentOverride(agentId: string): void {
  overrides.delete(agentId);
  persist(
    "agent_overrides",
    { agent_id: agentId, name: null, title: null, active: true, updated_at: new Date().toISOString() },
    "agent_id"
  );
}

export type EffectiveAgent = CompanyAgent & { active: boolean; customized: boolean };

/** The registry with the owner's customizations applied (pure over inputs). */
export function getEffectiveAgents(): EffectiveAgent[] {
  return COMPANY_AGENTS.map((agent) => {
    const o = overrides.get(agent.id);
    return {
      ...agent,
      name: o?.name || agent.name,
      title: o?.title || agent.title,
      active: o?.active !== false,
      customized: Boolean(o && (o.name || o.title || o.active === false)),
    };
  });
}

export function getEffectiveAgent(id: string): EffectiveAgent | undefined {
  return getEffectiveAgents().find((a) => a.id === id);
}

/** Test helper. */
export function _clearAgentOverrides(): void {
  overrides.clear();
}
