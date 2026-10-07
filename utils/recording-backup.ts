// Persists recording chunks to IndexedDB while a recording is in progress so the
// recording can be recovered if the browser (or the offscreen document) is killed
// before the user stops it.

export type RecordingBackup = {
  id: string;
  startedAt: number;
  mimeType: string;
};

type ChunkRecord = {
  sessionId: string;
  data: Blob;
};

const DB_NAME = 'srec-recordings';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const CHUNKS_STORE = 'chunks';
const SESSION_INDEX = 'sessionId';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
        const chunks = db.createObjectStore(CHUNKS_STORE, { autoIncrement: true });
        chunks.createIndex(SESSION_INDEX, SESSION_INDEX);
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

function runTransaction<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => IDBRequest<T> | void,
) {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const request = callback(transaction);

        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export async function createRecordingBackup(backup: RecordingBackup) {
  await runTransaction([SESSIONS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(SESSIONS_STORE).put(backup);
  });
}

export async function appendRecordingChunk(sessionId: string, data: Blob) {
  const record: ChunkRecord = { sessionId, data };

  await runTransaction([CHUNKS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(CHUNKS_STORE).add(record);
  });
}

export async function listRecordingBackups() {
  const backups = await runTransaction<RecordingBackup[]>([SESSIONS_STORE], 'readonly', (transaction) =>
    transaction.objectStore(SESSIONS_STORE).getAll(),
  );

  return backups ?? [];
}

export async function getRecordingBackupChunks(sessionId: string) {
  // Chunks use an auto-incrementing key, so results come back in recording order.
  const records = await runTransaction<ChunkRecord[]>([CHUNKS_STORE], 'readonly', (transaction) =>
    transaction.objectStore(CHUNKS_STORE).index(SESSION_INDEX).getAll(sessionId),
  );

  return (records ?? []).map((record) => record.data);
}

export async function deleteRecordingBackup(sessionId: string) {
  await runTransaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(SESSIONS_STORE).delete(sessionId);

    const chunkKeys = transaction
      .objectStore(CHUNKS_STORE)
      .index(SESSION_INDEX)
      .openKeyCursor(IDBKeyRange.only(sessionId));

    chunkKeys.onsuccess = () => {
      const cursor = chunkKeys.result;
      if (cursor) {
        transaction.objectStore(CHUNKS_STORE).delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  });
}
