import { createDatabase } from './indexed-db';

type LogLevel = 'info' | 'warn' | 'error';

type LogEntry = {
  time: number;
  level: LogLevel;
  context: string;
  message: string;
};

const ENTRIES_STORE = 'entries';
const MAX_ENTRIES = 1000;

const database = createDatabase('srec-logs', 1, (db) => {
  db.createObjectStore(ENTRIES_STORE, { autoIncrement: true });
});

type Logger = ReturnType<typeof createLogger>;

export function createLogger(context: string) {
  function write(level: LogLevel, message: string, details: unknown[]) {
    console[level](`[${context}] ${message}`, ...details);

    const entry: LogEntry = {
      time: Date.now(),
      level,
      context,
      message: [message, ...details.map(formatDetail)].filter(Boolean).join(' | '),
    };

    appendEntry(entry).catch((error) => console.warn('Could not write to the log.', error));
  }

  return {
    info: (message: string, ...details: unknown[]) => write('info', message, details),
    warn: (message: string, ...details: unknown[]) => write('warn', message, details),
    error: (message: string, ...details: unknown[]) => write('error', message, details),
  };
}

export function captureUncaughtErrors(logger: Logger) {
  self.addEventListener('error', (event) => {
    logger.error('Uncaught error.', event.error ?? event.message);
  });

  self.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection.', event.reason);
  });
}

export async function readLogEntries() {
  return (await database.run<LogEntry[]>([ENTRIES_STORE], 'readonly', (transaction) =>
    transaction.objectStore(ENTRIES_STORE).getAll(),
  )) ?? [];
}

export function formatLogEntry({ time, level, context, message }: LogEntry) {
  return `${new Date(time).toISOString()} ${level.toUpperCase().padEnd(5)} [${context}] ${message}`;
}

async function appendEntry(entry: LogEntry) {
  await database.run([ENTRIES_STORE], 'readwrite', (transaction) => {
    const store = transaction.objectStore(ENTRIES_STORE);
    store.add(entry);

    const count = store.count();
    count.onsuccess = () => {
      let excess = count.result - MAX_ENTRIES;
      if (excess <= 0) {
        return;
      }

      const oldest = store.openCursor();
      oldest.onsuccess = () => {
        const cursor = oldest.result;
        if (cursor && excess-- > 0) {
          cursor.delete();
          cursor.continue();
        }
      };
    };
  });
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack || `${detail.name}: ${detail.message}`;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail instanceof Event) {
    return `${detail.constructor.name} (${detail.type})`;
  }

  try {
    return JSON.stringify(detail) ?? String(detail);
  } catch {
    return String(detail);
  }
}
