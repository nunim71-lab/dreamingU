// 꿈꾸는부엉이 휴대폰 버전의 서비스 워커: 인터넷이 없어도 앱이 열리게 화면 파일을 기억해 둠.
// 항상 인터넷에서 새것을 먼저 받고(새 버전이 저절로 들어옴), 안 되면 기억해 둔 것을 씀.
// 꿈 일기는 여기서 다루지 않음 (브라우저 안 IndexedDB 에 따로 저장).
const CACHE = 'dreamingu-v3';
const SHELL = [
  './', './index.html', './privacy.html', './manifest.webmanifest', './icon.png', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/app.js', './js/astro.js', './js/claude.js', './js/local.js', './js/reading.js', './js/report.js', './js/sync.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 같은 주소의 화면 파일만 (Claude 에 보내는 요청 등은 건드리지 않음)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(event.request, { cache: 'no-cache' });
      if (fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(event.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
