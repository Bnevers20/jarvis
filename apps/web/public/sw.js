// JARVIS service worker — receives push and opens/speaks on tap.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = {};
  }
  const title = data.title || "JARVIS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "jarvis",
      data: { url: data.url || "/", speak: data.speak || data.body || "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const target = info.url || "/";
  const speak = info.speak || "";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.postMessage({ type: "jarvis-speak", text: speak });
            return;
          }
        }
        const url = speak ? target + "?speak=" + encodeURIComponent(speak) : target;
        return self.clients.openWindow(url);
      }),
  );
});
