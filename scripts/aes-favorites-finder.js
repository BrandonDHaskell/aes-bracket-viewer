// AES favorites finder
// 1. On results.advancedeventsystems.com, star 2+ teams (ideally in two divisions).
// 2. DevTools (F12) > Console, paste this file, press Enter.
// 3. A JSON file downloads. Upload it to the chat. It contains only storage entries that
//    look favorites-related, plus the names (not contents) of everything else.
(async () => {
    const looksRelevant = (key, value) => /fav|star|follow|team/i.test(key) || /fav|star|follow/i.test(String(value).slice(0, 2000));
    const clip = value => (String(value).length > 20000 ? `${String(value).slice(0, 20000)}...[truncated]` : String(value));
    const dumpStorage = storage => {
        const hits = {};
        const otherKeys = [];
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            const value = storage.getItem(key);
            if (looksRelevant(key, value)) hits[key] = clip(value);
            else otherKeys.push(key);
        }
        return { hits, otherKeys };
    };
    const report = {
        capturedAt: new Date().toISOString(),
        url: location.href,
        localStorage: dumpStorage(localStorage),
        sessionStorage: dumpStorage(sessionStorage),
        cookieNames: document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean),
        favoriteCookies: document.cookie.split(';').map(c => c.trim()).filter(c => /fav|star|follow/i.test(c)),
        indexedDB: []
    };
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        for (const info of await indexedDB.databases()) {
            const entry = { name: info.name, version: info.version, stores: {} };
            try {
                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(info.name);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                for (const storeName of db.objectStoreNames) {
                    const rows = await new Promise(resolve => {
                        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => resolve([]);
                    });
                    entry.stores[storeName] = /fav|star|follow/i.test(storeName) || /fav|star|follow/i.test(info.name)
                        ? rows.slice(0, 200)
                        : `${rows.length} rows (not captured)`;
                }
                db.close();
            } catch (error) {
                entry.error = String(error);
            }
            report.indexedDB.push(entry);
        }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }));
    link.download = `aes-favorites-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    console.log('[favorites] report', report);
})();
