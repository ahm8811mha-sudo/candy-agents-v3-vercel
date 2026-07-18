/**
 * Vercel deployment monitoring client.
 *
 * When VERCEL_API_TOKEN and VERCEL_PROJECT_ID are configured, real deployment
 * state is pulled from the Vercel REST API. Otherwise representative mock data
 * is returned so the operations dashboard renders during local/preview runs.
 */

export type DeploymentState =
  | "READY"
  | "BUILDING"
  | "ERROR"
  | "QUEUED"
  | "CANCELED"
  | "INITIALIZING";

export type DeploymentInfo = {
  id: string;
  url: string;
  state: DeploymentState;
  createdAt: string;
  target: string;
  commitMessage?: string;
};

export type MonitoringSnapshot = {
  connected: boolean;
  source: "live" | "mock";
  projectName: string;
  currentState: DeploymentState;
  healthy: boolean;
  deployments: DeploymentInfo[];
  errorCount: number;
  lastDeployedAt: string | null;
};

function token() {
  return process.env.VERCEL_API_TOKEN;
}

function projectId() {
  return process.env.VERCEL_PROJECT_ID;
}

function teamId() {
  return process.env.VERCEL_TEAM_ID;
}

export function isVercelConfigured(): boolean {
  return Boolean(token() && projectId());
}

/**
 * Vercel injects VERCEL=1 into every deployment, including previews.  The API
 * token is only needed for deployment-history monitoring; it is not required
 * to prove that the currently running build is deployed on Vercel.
 */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function mapState(raw: string | undefined): DeploymentState {
  const upper = (raw || "").toUpperCase();
  const valid: DeploymentState[] = ["READY", "BUILDING", "ERROR", "QUEUED", "CANCELED", "INITIALIZING"];
  return (valid.find((s) => s === upper) as DeploymentState) || "INITIALIZING";
}

function mockSnapshot(): MonitoringSnapshot {
  const now = Date.now();
  const deployments: DeploymentInfo[] = [
    { id: "dpl_mock_1", url: "candy-agents.vercel.app", state: "READY", createdAt: new Date(now - 3600000).toISOString(), target: "production", commitMessage: "Comprehensive UI/design overhaul" },
    { id: "dpl_mock_2", url: "candy-agents-preview.vercel.app", state: "READY", createdAt: new Date(now - 7200000).toISOString(), target: "preview", commitMessage: "Add agent memory + reports" },
    { id: "dpl_mock_3", url: "candy-agents-old.vercel.app", state: "ERROR", createdAt: new Date(now - 86400000).toISOString(), target: "preview", commitMessage: "WIP integration test" },
  ];
  return {
    connected: false,
    source: "mock",
    projectName: "candy-agents-v3-vercel",
    currentState: "READY",
    healthy: true,
    deployments,
    errorCount: deployments.filter((d) => d.state === "ERROR").length,
    lastDeployedAt: deployments[0].createdAt,
  };
}

type RawDeployment = {
  uid: string;
  url: string;
  state?: string;
  readyState?: string;
  created: number;
  target?: string;
  meta?: { githubCommitMessage?: string };
};

export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  if (!isVercelConfigured()) {
    return mockSnapshot();
  }

  try {
    const params = new URLSearchParams({ projectId: projectId()!, limit: "10" });
    if (teamId()) params.set("teamId", teamId()!);

    const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Vercel API error ${res.status}`);

    const data = (await res.json()) as { deployments?: RawDeployment[] };
    const deployments: DeploymentInfo[] = (data.deployments || []).map((d) => ({
      id: d.uid,
      url: d.url,
      state: mapState(d.state || d.readyState),
      createdAt: new Date(d.created).toISOString(),
      target: d.target || "preview",
      commitMessage: d.meta?.githubCommitMessage,
    }));

    const production = deployments.find((d) => d.target === "production") || deployments[0];
    const currentState = production?.state || "INITIALIZING";

    return {
      connected: true,
      source: "live",
      projectName: projectId()!,
      currentState,
      healthy: currentState === "READY",
      deployments,
      errorCount: deployments.filter((d) => d.state === "ERROR").length,
      lastDeployedAt: production?.createdAt || null,
    };
  } catch {
    return { ...mockSnapshot(), projectName: "تعذّر الوصول لـ Vercel", healthy: false };
  }
}
