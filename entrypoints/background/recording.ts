import { deleteRecordingBackup } from '@/utils/recording-backup';
import { sendOffscreenCommand, type OffscreenEvent } from '@/utils/messages';
import { IDLE_RECORDING_STATUS } from '@/utils/recording-status';
import { downloadRecording } from './download';
import { closeOffscreenDocument, ensureOffscreenDocument } from './offscreen-document';
import { getStatus, isRecording, setStatus } from './status-store';
import { clearRecordingBadge, setCloseWarning, showRecordingBadge } from './tab-indicators';

const STOP_TIMEOUT_MS = 15_000;
const UNRECORDABLE_URL_PREFIXES = ['chrome://', 'edge://'];

let pendingStop: { promise: Promise<void>; resolve: () => void } | null = null;

export async function startRecording() {
  if (isRecording()) {
    return;
  }
  const startedAt = Date.now();
  await setStatus({ state: 'recording', startedAt, tabId: null, error: null });
  await showRecordingBadge();

  await ensureOffscreenDocument();
  const tabId = await getActiveTabId();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await setStatus({ ...getStatus(), tabId });

  await sendOffscreenCommand({ type: 'START_OFFSCREEN_RECORDING', streamId, startedAt });
  await setCloseWarning(tabId, true);
}

export async function stopRecording() {
  if (!isRecording()) {
    return;
  }

  const stopped = waitForStop();
  await sendOffscreenCommand({ type: 'STOP_OFFSCREEN_RECORDING' });
  await stopped;
}

export async function saveRecording({
  blobUrl,
  filename,
  backupId,
}: Extract<OffscreenEvent, { type: 'RECORDING_STOPPED' }>) {
  await downloadRecording(blobUrl, filename);

  if (backupId) {
    await deleteRecordingBackup(backupId).catch(console.error);
  }

  const { tabId } = getStatus();
  await setStatus(IDLE_RECORDING_STATUS);
  await releaseRecordingResources(tabId);
  settlePendingStop();
}

export async function failRecording(error: string) {
  const { tabId } = getStatus();
  await setStatus({ state: 'error', startedAt: null, tabId: null, error });

  await sendOffscreenCommand({ type: 'CANCEL_OFFSCREEN_RECORDING' }).catch(() => {});
  await releaseRecordingResources(tabId);
  settlePendingStop();
}

async function releaseRecordingResources(tabId: number | null) {
  await Promise.all([clearRecordingBadge(), setCloseWarning(tabId, false)]);
  await closeOffscreenDocument();
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found to record.');
  }

  if (UNRECORDABLE_URL_PREFIXES.some((prefix) => tab.url?.startsWith(prefix))) {
    throw new Error('Chrome internal pages cannot be recorded.');
  }

  return tab.id;
}

function waitForStop() {
  if (pendingStop) {
    return pendingStop.promise;
  }

  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const timeoutId = setTimeout(() => {
    failRecording('Timed out while stopping the recording.').catch(console.error);
  }, STOP_TIMEOUT_MS);

  pendingStop = {
    promise,
    resolve: () => {
      clearTimeout(timeoutId);
      pendingStop = null;
      resolvePromise();
    },
  };

  return promise;
}

function settlePendingStop() {
  pendingStop?.resolve();
}
