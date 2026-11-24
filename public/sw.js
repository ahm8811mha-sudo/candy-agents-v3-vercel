/* Orvanta: only the public offline document may be stored. Never cache
 * owner pages, API responses, or authenticated navigations. */
const CACHE = "orvanta-offline-v2";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE, { cache: "reload", credentials: "omit", redirect: "error" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Offline document unavailable");
    const cache = await caches.open(CACHE);
    await cache.put(OFFLINE, response);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("orvanta-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || req.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(req).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(OFFLINE)) || new Response("Orvanta: offline. Reconnect to continue.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL("/inbox", self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) {
      await client.navigate(destination);
      await client.focus();
    } else {
      await self.clients.openWindow(destination);
    }
  })());
});
