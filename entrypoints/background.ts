type RecordingStatus = {
  state: 'idle' | 'recording' | 'error';
  startedAt: number | null;
  error: string | null;
};

type PopupMessage =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_STATUS' };

type OffscreenMessage =
  | { type: 'OFFSCREEN_READY' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'RECORDING_STOPPED'; blobUrl: string; filename: string }
  | { type: 'RECORDING_ERROR'; error: string };

type ExtensionMessage = PopupMessage | OffscreenMessage;

const OFFSCREEN_URL = 'offscreen.html';
const STATUS_STORAGE_KEY = 'recordingStatus';

const idleStatus: RecordingStatus = {
  state: 'idle',
  startedAt: null,
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
        state: 'recording',
        startedAt: status.startedAt ?? Date.now(),
        error: null,
      });
      await setRecordingBadge();
      return { ok: true, status };

    case 'RECORDING_STOPPED':
      await downloadRecording(message.blobUrl, message.filename);
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
    error: null,
  });
  await setRecordingBadge();

  try {
    await ensureOffscreenDocument();
    const tabId = await getActiveTabId();
    const streamId = await getTabMediaStreamId(tabId);

    await chrome.runtime.sendMessage({
      type: 'START_OFFSCREEN_RECORDING',
      streamId,
      startedAt: status.startedAt,
    });
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
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Record the selected browser tab with audio.',
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
  await setStatus(idleStatus);

  await clearRecordingBadge();
  await closeOffscreenDocument();
}

async function setError(error: string) {
  await setStatus({
    state: 'error',
    startedAt: null,
    error,
  });

  await Promise.all([
    clearRecordingBadge(),
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
    (typeof candidate.error === 'string' || candidate.error === null)
  );
}
