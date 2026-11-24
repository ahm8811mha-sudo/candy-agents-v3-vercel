// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker(network: () => Promise<Response>) {
  const events: Record<string, (event: any) => void> = {};
  const entries = new Map<string, Response>();
  const deleted: string[] = [];
  const cache = { put: async (key: string, value: Response) => { entries.set(key, value); }, match: async (key: string) => entries.get(key) };
  vm.runInNewContext(source, { URL, Response, fetch: network, caches: { open: async () => cache, keys: async () => ["orvanta-v1", "other-app", "orvanta-offline-v2"], delete: async (key: string) => { deleted.push(key); } }, self: { location: { origin: "https://example.test" }, addEventListener: (name: string, callback: (event: any) => void) => { events[name] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } } });
  return { events, entries, deleted };
}
describe("mobile offline privacy", () => {
  it("installs only the public offline fallback", async () => {
    const w = worker(async () => new Response("offline", { headers: { "content-type": "text/html" } }));
    let task: Promise<unknown> | undefined;
    w.events.install({ waitUntil: (p: Promise<unknown>) => { task = p; } });
    await task;
    expect([...w.entries.keys()]).toEqual(["/offline.html"]);
  });
  it("clears legacy Orvanta caches, not unrelated caches", async () => {
    const w = worker(async () => new Response("online"));
    let task: Promise<unknown> | undefined;
    w.events.activate({ waitUntil: (p: Promise<unknown>) => { task = p; } });
    await task;
    expect(w.deleted).toEqual(["orvanta-v1"]);
  });
  it("does not store live owner pages or intercept APIs", async () => {
    const w = worker(async () => new Response("private"));
    let result: Promise<Response> | undefined;
    const respondWith = (p: Promise<Response>) => { result = p; };
    w.events.fetch({ request: { method: "GET", mode: "navigate", url: "https://example.test/office" }, respondWith });
    expect(await (await result)?.text()).toBe("private");
    expect(w.entries.size).toBe(0);
    result = undefined;
    w.events.fetch({ request: { method: "GET", mode: "navigate", url: "https://example.test/api/inbox" }, respondWith });
    expect(result).toBeUndefined();
  });
  it("never falls back to previously viewed private HTML", async () => {
    const w = worker(async () => { throw new Error("offline"); });
    w.entries.set("/", new Response("private"));
    w.entries.set("/offline.html", new Response("safe"));
    let result: Promise<Response> | undefined;
    w.events.fetch({ request: { method: "GET", mode: "navigate", url: "https://example.test/office" }, respondWith: (p: Promise<Response>) => { result = p; } });
    expect(await (await result)?.text()).toBe("safe");
  });
});
