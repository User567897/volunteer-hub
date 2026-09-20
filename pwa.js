if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}); }
