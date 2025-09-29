self.addEventListener('install', e => {
  e.waitUntil(caches.open('schichtplan-v4-9').then(cache => cache.addAll([
    './','./index.html','./style.css','./app.js','./config.js','./supabaseClient.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
