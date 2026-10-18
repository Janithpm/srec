import { getErrorMessage } from '@/utils/errors';
import { sendToOffscreen, type RecordingStoppedEvent } from '@/utils/messages';
import { deleteRecordingBackup } from '@/utils/recording-backup';
import { createErrorStatus, IDLE_RECORDING_STATUS } from '@/utils/recording-status';
import { getSettings } from '@/utils/settings';
import { downloadRecording } from './download';
import { holdOffscreenDocument, releaseOffscreenDocument } from './offscreen-document';
import { getStatus, isRecording, setStatus } from './status-store';
import { clearRecordingBadge, setCloseWarning, showRecordingBadge } from './tab-indicators';

const RECORDING_HOLDER = 'recording';
const STOP_TIMEOUT_MS = 15_000;
const UNRECORDABLE_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'devtools://'];

let pendingStart: Promise<void> | null = null;
let pendingStop: { promise: Promise<void>; resolve: () => void } | null = null;

export async function startRecording() {
  if (isRecording()) {
    return;
  }

  pendingStart = beginRecording();

  try {
    await pendingStart;
  } finally {
    pendingStart = null;
  }
}

export async function stopRecording() {
  await pendingStart?.catch(() => {});

  if (!isRecording()) {
    return;
  }

  const stopped = waitForStop();
  await sendToOffscreen({ type: 'STOP_OFFSCREEN_RECORDING' });
  await stopped;
}

export async function setRecordingMicrophone(enabled: boolean) {
  await pendingStart?.catch(() => {});

  if (isRecording()) {
    await sendToOffscreen({ type: 'SET_OFFSCREEN_MICROPHONE', enabled }).catch(console.error);
  }
}

export async function saveRecording({ blobUrl, filename, backupId }: RecordingStoppedEvent) {
  const { tabId } = getStatus();

  await holdOffscreenDocument(blobUrl);
  await releaseOffscreenDocument(RECORDING_HOLDER);
  await setStatus(IDLE_RECORDING_STATUS);
  await clearRecordingIndicators(tabId);
  settlePendingStop();

  try {
    await downloadRecording(blobUrl, filename);

    if (backupId) {
      await deleteRecordingBackup(backupId).catch(console.error);
    }
  } catch (error) {
    if (!isRecording()) {
      await setStatus(createErrorStatus(getErrorMessage(error)));
    }
  } finally {
    await releaseOffscreenDocument(blobUrl);
  }
}

export async function failRecording(error: string) {
  const { tabId } = getStatus();

  await setStatus(createErrorStatus(error));
  await sendToOffscreen({ type: 'CANCEL_OFFSCREEN_RECORDING' }).catch(() => {});
  await clearRecordingIndicators(tabId);
  await releaseOffscreenDocument(RECORDING_HOLDER);
  settlePendingStop();
}

async function beginRecording() {
  const startedAt = Date.now();
  await setStatus({ state: 'recording', startedAt, tabId: null, error: null });
  await showRecordingBadge();

  const tabId = await getRecordableTabId();
  await setStatus({ ...getStatus(), tabId });
  await holdOffscreenDocument(RECORDING_HOLDER);

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const { microphone } = await getSettings();
  await sendToOffscreen({ type: 'START_OFFSCREEN_RECORDING', streamId, startedAt, microphone });
  await setCloseWarning(tabId, true);
}

async function getRecordableTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found to record.');
  }

  if (UNRECORDABLE_URL_PREFIXES.some((prefix) => tab.url?.startsWith(prefix))) {
    throw new Error('Browser pages cannot be recorded.');
  }

  return tab.id;
}

async function clearRecordingIndicators(tabId: number | null) {
  await Promise.all([clearRecordingBadge(), setCloseWarning(tabId, false)]);
}

function waitForStop() {
  if (pendingStop) {
    return pendingStop.promise;
  }

  let resolveStop!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });

  const timeoutId = setTimeout(() => {
    failRecording('Timed out while stopping the recording.').catch(console.error);
  }, STOP_TIMEOUT_MS);

  pendingStop = {
    promise,
    resolve: () => {
      clearTimeout(timeoutId);
      pendingStop = null;
      resolveStop();
    },
  };

  return promise;
}

function settlePendingStop() {
  pendingStop?.resolve();
}
