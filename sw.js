// Replace the previous Apps Script shell without caching student data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('avenger-volunteer-hub'))await caches.delete(name);
 await self.clients.claim();
})()));
// All app assets and authenticated requests remain network-only.
