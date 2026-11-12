import { createDatabase } from './indexed-db';

export type RecordingBackup = {
  id: string;
  startedAt: number;
  mimeType: string;
};

type ChunkRecord = {
  sessionId: string;
  data: Blob;
};

const SESSIONS_STORE = 'sessions';
const CHUNKS_STORE = 'chunks';
const SESSION_INDEX = 'sessionId';

const database = createDatabase('srec-recordings', 1, (db) => {
  db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
  const chunks = db.createObjectStore(CHUNKS_STORE, { autoIncrement: true });
  chunks.createIndex(SESSION_INDEX, SESSION_INDEX);
});

export async function createRecordingBackup(backup: RecordingBackup) {
  await database.run([SESSIONS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(SESSIONS_STORE).put(backup);
  });
}

export async function appendRecordingChunk(sessionId: string, data: Blob) {
  const record: ChunkRecord = { sessionId, data };

  await database.run([CHUNKS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(CHUNKS_STORE).add(record);
  });
}

export async function listRecordingBackups() {
  const backups = await database.run<RecordingBackup[]>([SESSIONS_STORE], 'readonly', (transaction) =>
    transaction.objectStore(SESSIONS_STORE).getAll(),
  );

  return backups ?? [];
}

export async function getRecordingBackupChunks(sessionId: string) {
  const records = await database.run<ChunkRecord[]>([CHUNKS_STORE], 'readonly', (transaction) =>
    transaction.objectStore(CHUNKS_STORE).index(SESSION_INDEX).getAll(sessionId),
  );

  return (records ?? []).map((record) => record.data);
}

export async function deleteRecordingBackup(sessionId: string) {
  await database.run([SESSIONS_STORE, CHUNKS_STORE], 'readwrite', (transaction) => {
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
