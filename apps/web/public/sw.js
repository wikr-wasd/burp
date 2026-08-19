/*
 * Service worker för Burps notiser.
 *
 * Gör exakt två saker: visar en notis när en push kommer in, och öppnar rätt
 * sida när någon trycker på den. Ingen cachning, ingen offline-hantering,
 * ingenting som ligger mellan gästen och sidan.
 *
 * Det är avsiktligt. En service worker som cachar är en service worker som kan
 * servera gammal kod — och den sortens fel är svårare att felsöka än allt den
 * hade sparat in. QR-flödet lever på att sidan är färsk.
 */

self.addEventListener("install", () => {
  // Ta över direkt i stället för att vänta på att alla flikar stängs. En
  // uppdaterad worker som ligger och väntar är en worker som inte larmar.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Ett meddelande vi inte förstår ska inte tysta larmet helt.
    payload = { title: "Ny beställning", body: "Öppna Burp för att se den.", url: "/dashboard/order" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Burp", {
      body: payload.body ?? "",
      // Ikonen ligger på en egen rutt och genereras ur samma bézierkurva som
      // favicon och PWA-ikonerna — en enda kopia av pratbubblan.
      icon: "/pwa-ikon/192",
      badge: "/pwa-ikon/96",
      tag: payload.tag,
      // Notisen ska stå kvar tills någon tittar på den. En rush är precis när
      // man missar något som försvinner av sig självt.
      requireInteraction: true,
      // Ljud och skakning styrs av systemet, men vibrationen går att be om.
      vibrate: [200, 100, 200],
      data: { url: payload.url ?? "/dashboard/order" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url ?? "/dashboard/order";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      /*
       * Återanvänd en flik som redan är öppen.
       *
       * Utan det får personalen en ny flik för varje notis, och efter ett pass
       * har surfplattan trettio flikar med samma sida.
       */
      for (const client of clients) {
        if (client.url.includes("/dashboard") || client.url.includes("/kok")) {
          return client.focus().then((focused) => focused.navigate(target));
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});
