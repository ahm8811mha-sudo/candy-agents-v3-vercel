export type DeploymentContext = {
  environment: string;
  isPreview: boolean;
  productionUrl: string | null;
};

function productionUrlFromEnvironment() {
  const rawHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!rawHost) return null;

  const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `https://${host}` : null;
}

export function getDeploymentContext(): DeploymentContext {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  return {
    environment,
    isPreview: environment === "preview",
    productionUrl: productionUrlFromEnvironment(),
  };
}
