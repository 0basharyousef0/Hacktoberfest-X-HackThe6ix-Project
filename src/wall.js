// The reaction photo wall. Kept photos are stored in this browser's IndexedDB, so they
// survive refreshes, closing the tab and restarting the server, until someone deletes them.
// Nothing is uploaded anywhere.

const DB_NAME = 'dont-blink-wall';
const STORE = 'photos';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      console.warn('[wall] storage unavailable, photos will not be kept', err);
      return null;
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      db &&
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result?.result ?? true);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// photos: [{ name, scare, dataUrl }]
export async function keepPhotos(photos) {
  const takenAt = Date.now();
  return run('readwrite', (store) => photos.forEach((p) => store.add({ ...p, takenAt })));
}

export async function allPhotos() {
  const rows = (await run('readonly', (store) => store.getAll())) || [];
  return rows.sort((a, b) => b.takenAt - a.takenAt || b.id - a.id);
}

export async function photoCount() {
  return (await run('readonly', (store) => store.count())) || 0;
}
