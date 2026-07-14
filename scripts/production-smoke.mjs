import { spawn } from "node:child_process";

const port = Number(process.env.ORVANTA_SMOKE_PORT || 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerCode = "ci-production-smoke-owner-code";

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_ENABLED: "false",
      ORVANTA_PERSONAL_MODE: "true",
      ORVANTA_OWNER_ACCESS_KEY: ownerCode,
      ORVANTA_OWNER_COOKIE_SECRET: "ci-production-smoke-cookie-secret-at-least-32-chars",
      ORVANTA_COOKIE_SECURE: "false",
      ORVANTA_TENANT_ID: "golden-star",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited early (${server.exitCode}).\n${serverOutput.slice(-3000)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Build startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Production server did not become ready.\n${serverOutput.slice(-3000)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(name, check) {
  await check();
  console.log(`PASS ${name}`);
}

try {
  await waitForServer();

  await run("public-health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert(response.status === 200 && body.ok === true, "Health endpoint is not public and healthy.");
  });

  await run("anonymous-redirect", async () => {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert(response.status >= 300 && response.status < 400, `Expected redirect, received ${response.status}.`);
    assert(response.headers.get("location")?.includes("/login"), "Anonymous browser was not redirected to login.");
  });

  await run("private-api", async () => {
    const response = await fetch(`${baseUrl}/api/dashboard`, { redirect: "manual" });
    const body = await response.json();
    assert(response.status === 401 && body.code === "OWNER_ACCESS_REQUIRED", "Private API did not fail closed.");
  });

  await run("commercial-api-disabled", async () => {
    const response = await fetch(`${baseUrl}/api/public/v1/status`, { redirect: "manual" });
    const body = await response.json();
    assert(response.status === 403 && body.code === "PERSONAL_MODE", "Commercial API is exposed in personal mode.");
  });

  let cookie = "";
  await run("owner-login", async () => {
    const response = await fetch(`${baseUrl}/api/owner-access`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.2" },
      body: JSON.stringify({ code: ownerCode }),
    });
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") || "";
    cookie = setCookie.split(";")[0];
    assert(response.status === 200 && body.authenticated === true && cookie.startsWith("orvanta_owner_access="), "Owner login did not issue a trusted-device cookie.");
  });

  await run("trusted-owner-cookie", async () => {
    const response = await fetch(`${baseUrl}/`, { headers: { cookie }, redirect: "manual" });
    assert(response.status === 200, `Trusted owner did not reach the application (${response.status}).`);
    assert(response.headers.get("x-orvanta-access-mode") === "personal-owner-device", "Trusted access marker is missing.");
  });
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}
