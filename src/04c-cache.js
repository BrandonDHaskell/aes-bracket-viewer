/* =========================================================================
 * 4c. Saved copies of finished pools (IndexedDB)
 * ======================================================================= */

// A pool sheet from an earlier day whose matches all have results will not change, so a copy
// is kept in this browser and reused on later visits instead of being downloaded again. The
// Refresh button always downloads fresh copies. If storage is unavailable (private browsing,
// quota, blocked IndexedDB) the viewer simply downloads everything, as before.
const SHEET_DB = { name: 'aes-bracket-viewer', version: 1, store: 'poolSheets', maxAgeDays: 180 };
let sheetDbPromise = null;

const sheetRecordId = (eventKey, playId) => `${eventKey}|${playId}`;

function idbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openSheetDb() {
    if (sheetDbPromise) return sheetDbPromise;
    sheetDbPromise = new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                resolve(null);
                return;
            }
            const request = indexedDB.open(SHEET_DB.name, SHEET_DB.version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(SHEET_DB.store)) {
                    db.createObjectStore(SHEET_DB.store, { keyPath: 'id' }).createIndex('savedAt', 'savedAt');
                }
            };
            request.onsuccess = () => {
                resolve(request.result);
                pruneSavedSheets(request.result);
            };
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return sheetDbPromise;
}

// Drops copies older than maxAgeDays so storage does not grow without limit.
function pruneSavedSheets(db) {
    try {
        if (typeof IDBKeyRange === 'undefined') return;
        const cutoff = Date.now() - SHEET_DB.maxAgeDays * 86400000;
        const cursorRequest = db.transaction(SHEET_DB.store, 'readwrite').objectStore(SHEET_DB.store)
            .index('savedAt').openCursor(IDBKeyRange.upperBound(cutoff));
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            cursor.delete();
            cursor.continue();
        };
    } catch {
        // Best effort only.
    }
}

async function readSavedSheets(eventKey, playIds) {
    const found = new Map();
    if (!playIds.length) return found;
    const db = await openSheetDb();
    if (!db) return found;
    try {
        const store = db.transaction(SHEET_DB.store, 'readonly').objectStore(SHEET_DB.store);
        await Promise.all(playIds.map(async playId => {
            const record = await idbRequest(store.get(sheetRecordId(eventKey, playId)));
            if (record?.sheet) found.set(playId, record.sheet);
        }));
    } catch (error) {
        console.warn('[AES Bracket Viewer] saved pool sheets unavailable', error);
    }
    return found;
}

async function saveSheets(eventKey, sheets) {
    if (!sheets.size) return;
    const db = await openSheetDb();
    if (!db) return;
    try {
        const transaction = db.transaction(SHEET_DB.store, 'readwrite');
        const store = transaction.objectStore(SHEET_DB.store);
        const savedAt = Date.now();
        for (const [playId, sheet] of sheets) store.put({ id: sheetRecordId(eventKey, playId), eventKey, playId, savedAt, sheet });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } catch (error) {
        console.warn('[AES Bracket Viewer] could not save pool sheets', error);
    }
}
