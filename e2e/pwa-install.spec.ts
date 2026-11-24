import { test, expect } from "@playwright/test";
test("public installation assets work without owner access", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(manifest.status()).toBe(200);
  const metadata = await manifest.json();
  expect(metadata.display).toBe("standalone");
  expect(metadata.scope).toBe("/");
  for (const path of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
    const icon = await request.get(path, { maxRedirects: 0 });
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
  }
  const sw = await request.get("/sw.js", { maxRedirects: 0 });
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain("orvanta-offline-v2");
  const offline = await request.get("/offline.html", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain("أنت غير متصل");
  const privateApi = await request.get("/api/inbox", { maxRedirects: 0 });
  expect([401, 503]).toContain(privateApi.status());
});
