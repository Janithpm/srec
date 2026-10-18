import {
  IDLE_RECORDING_STATUS,
  RECORDING_STATUS_STORAGE_KEY,
  type RecordingStatus,
} from '@/utils/recording-status';

let status: RecordingStatus = IDLE_RECORDING_STATUS;
let loadingStatus: Promise<void> | null = null;

export function ensureStatusLoaded() {
  loadingStatus ??= loadStatus();
  return loadingStatus;
}

export function getStatus() {
  return status;
}

export function isRecording() {
  return status.state === 'recording';
}

export async function setStatus(nextStatus: RecordingStatus) {
  status = nextStatus;
  await chrome.storage.session.set({ [RECORDING_STATUS_STORAGE_KEY]: nextStatus });
}

async function loadStatus() {
  const stored = await chrome.storage.session.get(RECORDING_STATUS_STORAGE_KEY);
  status = (stored[RECORDING_STATUS_STORAGE_KEY] as RecordingStatus | undefined) ?? status;
}
