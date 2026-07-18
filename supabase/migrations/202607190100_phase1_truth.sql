-- Phase 1: Truth First
ALTER TABLE company_actions ADD COLUMN IF NOT EXISTS execution_status TEXT DEFAULT 'planned' CHECK (execution_status IN ('planned', 'executed', 'blocked', 'waiting_owner', 'failed'));
ALTER TABLE company_actions ADD COLUMN IF NOT EXISTS proof_evidence JSONB;
ALTER TABLE company_actions ADD COLUMN IF NOT EXISTS reality_gap NUMERIC DEFAULT 0;
ALTER TABLE company_actions ADD COLUMN IF NOT EXISTS gap_description TEXT;

-- Similar for projects and decisions
-- Add RLS and indexes
CREATE INDEX idx_actions_status ON company_actions(execution_status);