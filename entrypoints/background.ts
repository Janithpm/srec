import { deleteRecordingBackup, listRecordingBackups } from '@/utils/recording-backup';

type RecordingStatus = {
  state: 'idle' | 'recording' | 'error';
  startedAt: number | null;
  tabId: number | null;
  error: string | null;
};

type PopupMessage =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_STATUS' };

type OffscreenMessage =
  | { type: 'OFFSCREEN_READY' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'RECORDING_STOPPED'; blobUrl: string; filename: string; backupId: string | null }
  | { type: 'RECORDING_ERROR'; error: string };

type ExtensionMessage = PopupMessage | OffscreenMessage;

type RecoverRecordingsResponse = {
  ok: boolean;
  recordings?: { blobUrl: string; filename: string; backupId: string }[];
};

const OFFSCREEN_URL = 'offscreen.html';
const STATUS_STORAGE_KEY = 'recordingStatus';

const idleStatus: RecordingStatus = {
  state: 'idle',
  startedAt: null,
  tabId: null,
  error: null,
};

let status: RecordingStatus = idleStatus;

let creatingOffscreen: Promise<void> | null = null;
let loadingStatus: Promise<void> | null = null;
let stopCompletion: { promise: Promise<void>; resolve: () => void } | null = null;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error) => {
        const message = getErrorMessage(error);
        setError(message).catch(console.error);
        sendResponse({ ok: false, error: message, status });
      });

    return true;
  });

  // The injected close warning is lost when the recorded tab navigates, so add it again.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') {
      return;
    }

    ensureStatusLoaded()
      .then(() => {
        if (status.state === 'recording' && status.tabId === tabId) {
          return setCloseWarning(tabId, true);
        }
      })
      .catch(console.error);
  });

  chrome.runtime.onStartup.addListener(() => {
    recoverInterruptedRecordings().catch(console.error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    recoverInterruptedRecordings().catch(console.error);
  });
});

async function handleMessage(message: ExtensionMessage) {
  await ensureStatusLoaded();

  switch (message.type) {
    case 'GET_STATUS':
      return { ok: true, status };

    case 'START_RECORDING':
      await startRecording();
      return { ok: true, status };

    case 'STOP_RECORDING':
      await stopRecording();
      return { ok: true, status };

    case 'RECORDING_STARTED':
      await setStatus({
        ...status,
        state: 'recording',
        startedAt: status.startedAt ?? Date.now(),
        error: null,
      });
      await setRecordingBadge();
      return { ok: true, status };

    // Sent after a stop from the popup, and also when the recorded tab is closed.
    case 'RECORDING_STOPPED':
      await downloadRecording(message.blobUrl, message.filename);
      if (message.backupId) {
        await deleteRecordingBackup(message.backupId).catch(console.error);
      }
      await cleanupAfterRecording();
      resolveStopCompletion();
      return { ok: true, status };

    case 'RECORDING_ERROR':
      await setError(message.error);
      resolveStopCompletion();
      return { ok: true, status };

    case 'OFFSCREEN_READY':
      return { ok: true };

    default:
      return { ok: false, error: 'Unknown message type.', status };
  }
}

async function startRecording() {
  if (status.state === 'recording') {
    return;
  }

  await setStatus({
    state: 'recording',
    startedAt: Date.now(),
    tabId: null,
    error: null,
  });
  await setRecordingBadge();

  try {
    await ensureOffscreenDocument();
    const tabId = await getActiveTabId();
    const streamId = await getTabMediaStreamId(tabId);
    await setStatus({ ...status, tabId });

    await chrome.runtime.sendMessage({
      type: 'START_OFFSCREEN_RECORDING',
      streamId,
      startedAt: status.startedAt,
    });
    await setCloseWarning(tabId, true);
  } catch (error) {
    await setError(getErrorMessage(error));
    throw error;
  }
}

async function stopRecording() {
  if (status.state !== 'recording') {
    return;
  }

  const completion = createStopCompletion();
  await chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_RECORDING' });
  await completion;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS],
      justification: 'Record the selected browser tab with audio and save recordings.',
    });
  }

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  return contexts.length > 0;
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found to record.');
  }

  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) {
    throw new Error('Chrome internal pages cannot be recorded.');
  }

  return tab.id;
}

async function getTabMediaStreamId(tabId: number) {
  return chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });
}

async function downloadRecording(blobUrl: string, filename: string) {
  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: false,
    });
  } finally {
    await chrome.runtime.sendMessage({ type: 'REVOKE_RECORDING_URL', blobUrl }).catch(() => {});
  }
}

async function cleanupAfterRecording() {
  await setCloseWarning(status.tabId, false);
  await setStatus(idleStatus);

  await clearRecordingBadge();
  await closeOffscreenDocument();
}

async function setError(error: string) {
  const recordedTabId = status.tabId;

  await setStatus({
    state: 'error',
    startedAt: null,
    tabId: null,
    error,
  });

  await Promise.all([
    clearRecordingBadge(),
    setCloseWarning(recordedTabId, false),
    chrome.runtime.sendMessage({ type: 'CANCEL_OFFSCREEN_RECORDING' }).catch(() => {}),
  ]);
  await closeOffscreenDocument();
  resolveStopCompletion();
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

// Recordings are backed up to IndexedDB while they run. A backup that is still
// there when the browser starts belongs to a recording that was interrupted
// (browser quit or crashed), so rebuild it and download it.
async function recoverInterruptedRecordings() {
  await ensureStatusLoaded();

  if (isRecording() || (await listRecordingBackups()).length === 0) {
    return;
  }

  await ensureOffscreenDocument();

  try {
    const response: RecoverRecordingsResponse = await chrome.runtime.sendMessage({
      type: 'RECOVER_RECORDINGS',
    });

    for (const recording of response.recordings ?? []) {
      await downloadRecording(recording.blobUrl, recording.filename);
      await deleteRecordingBackup(recording.backupId);
    }
  } finally {
    // A recording may have started while recovering; it needs the offscreen document.
    if (!isRecording()) {
      await closeOffscreenDocument();
    }
  }
}

function isRecording() {
  return status.state === 'recording';
}

async function setCloseWarning(tabId: number | null, enabled: boolean) {
  if (tabId === null) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: toggleBeforeUnloadWarning,
      args: [enabled],
    });
  } catch {
    // The tab is gone or can't be scripted (e.g. the Chrome Web Store).
  }
}

// Runs inside the recorded tab, so it must not reference anything outside itself.
function toggleBeforeUnloadWarning(enabled: boolean) {
  const page = window as Window & { __srecBeforeUnload?: (event: BeforeUnloadEvent) => void };

  if (enabled && !page.__srecBeforeUnload) {
    page.__srecBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', page.__srecBeforeUnload);
  } else if (!enabled && page.__srecBeforeUnload) {
    window.removeEventListener('beforeunload', page.__srecBeforeUnload);
    delete page.__srecBeforeUnload;
  }
}

async function setRecordingBadge() {
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text: 'REC' });
}

async function clearRecordingBadge() {
  await chrome.action.setBadgeText({ text: '' });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Recording failed. Please try again.';
}

function createStopCompletion() {
  if (!stopCompletion) {
    let timeoutId: ReturnType<typeof setTimeout>;
    const promise = new Promise<void>((resolve) => {
      stopCompletion = {
        promise: Promise.resolve(),
        resolve: () => {
          globalThis.clearTimeout(timeoutId);
          stopCompletion = null;
          resolve();
        },
      };
    });

    stopCompletion!.promise = promise;
    timeoutId = globalThis.setTimeout(() => {
      setError('Timed out while stopping the recording.').catch(console.error);
      resolveStopCompletion();
    }, 15000);
  }

  return stopCompletion!.promise;
}

function resolveStopCompletion() {
  stopCompletion?.resolve();
}

async function ensureStatusLoaded() {
  if (!loadingStatus) {
    loadingStatus = loadStatus();
  }

  await loadingStatus;
}

async function loadStatus() {
  const stored = await chrome.storage.session.get(STATUS_STORAGE_KEY);
  const storedStatus = stored[STATUS_STORAGE_KEY];

  if (isRecordingStatus(storedStatus)) {
    status = storedStatus;
  }
}

async function setStatus(nextStatus: RecordingStatus) {
  status = nextStatus;
  await chrome.storage.session.set({ [STATUS_STORAGE_KEY]: nextStatus });
}

function isRecordingStatus(value: unknown): value is RecordingStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as RecordingStatus;
  return (
    (candidate.state === 'idle' ||
      candidate.state === 'recording' ||
      candidate.state === 'error') &&
    (typeof candidate.startedAt === 'number' || candidate.startedAt === null) &&
    (typeof candidate.tabId === 'number' || candidate.tabId === null) &&
    (typeof candidate.error === 'string' || candidate.error === null)
  );
}
