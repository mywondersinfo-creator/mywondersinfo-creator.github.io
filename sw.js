// Мои чудеса (My Wonders) — офлайн-кэш и приём фото из «Поделиться». При обновлении приложения увеличь номер версии.
const CACHE = "mc2-v237", SHARE = "mc2-share", REM = "mc2-rem";
const FILES = ["./", "index.html", "manifest.webmanifest", "manifest-ru.webmanifest", "manifest-en.webmanifest", "manifest-fr.webmanifest", "manifest-es.webmanifest", "manifest-de.webmanifest", "manifest-it.webmanifest", "manifest-pt.webmanifest", "manifest-tr.webmanifest", "manifest-zh.webmanifest", "manifest-ja.webmanifest", "manifest-hi.webmanifest", "manifest-el.webmanifest", "manifest-ar.webmanifest", "manifest-fa.webmanifest", "manifest-he.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "privacy.html", "zvuk-zvezda.mp3"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARE && k !== REM).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {   // a photo shared from the gallery
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), file = fd.get("photo"), text = [fd.get("title"), fd.get("text")].filter(Boolean).join(" ");
        const c = await caches.open(SHARE); await c.delete("shared-photo"); await c.delete("shared-text");
        if (file && file.size) await c.put("shared-photo", new Response(file, { headers: { "Content-Type": file.type || "image/jpeg" } }));
        if (text) await c.put("shared-text", new Response(text));
      } catch (err) {}
      return Response.redirect("./?shared=1", 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;
  // cache-first: the app (8 MB) is downloaded once per version, not on every launch; a new version arrives with a new sw.js
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match("index.html"))));
});

// «Вечерняя звезда»: Android wakes the worker now and then (periodic background sync); in the chosen evening hours,
// if no wonder was written today and nothing was sent yet, one quiet notification. The app keeps "state" up to date.
const dkey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
async function evening() {
  const c = await caches.open(REM), r = await c.match("state"); if (!r) return;
  const s = await r.json(); if (!s.on) return;
  const now = new Date(), h = now.getHours(), day = dkey(now);
  if (h < s.win[0]) return;                          // from the chosen hour until midnight
  if ((s.days || []).includes(day)) return;          // a wonder is already written today
  const sent = await c.match("sent"); if (sent && (await sent.text()) === day) return;
  const set = new Set(s.days || []), d = new Date(now); let streak = 0;
  for (;;) { d.setDate(d.getDate() - 1); if (set.has(dkey(d))) streak++; else break; }
  let x = 0; for (const ch of day) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const t = s.r, title = streak >= 2 ? t.st.replace("{n}", streak + 1) : t.t[x % t.t.length], body = streak >= 2 ? t.sb : t.b[(x >>> 3) % t.b.length];
  await self.registration.showNotification(title, { body, icon: "icon-192.png", badge: s.badge || undefined, image: s.img || undefined, tag: "mc2-evening", vibrate: [18, 110, 18, 110, 46], data: { url: "./?write=1" }, actions: [{ action: "write", title: t.write }, { action: "skip", title: t.skip }] });
  await c.put("sent", new Response(day));
}
self.addEventListener("periodicsync", (e) => { if (e.tag === "mc2-evening") e.waitUntil(evening().catch(() => {})); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); if (e.action === "skip") return;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of all) { if ("focus" in w) { w.postMessage({ mc2: "write" }); return w.focus(); } }
    return self.clients.openWindow("./?write=1");
  })());
});
