export function createDatabase(name: string, version: number, upgrade: (db: IDBDatabase) => void) {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function open() {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version);

      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });

    return dbPromise;
  }

  async function run<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    callback: (transaction: IDBTransaction) => IDBRequest<T> | void,
  ) {
    const db = await open();

    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      const request = callback(transaction);

      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  return { run };
}
