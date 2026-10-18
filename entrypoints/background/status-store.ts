import { IDLE_RECORDING_STATUS, isRecordingStatus, type RecordingStatus } from '@/utils/recording-status';

const STATUS_STORAGE_KEY = 'recordingStatus';

let status: RecordingStatus = IDLE_RECORDING_STATUS;
let restoringStatus: Promise<void> | null = null;

export function ensureStatusLoaded() {
  restoringStatus ??= restoreStatus();
  return restoringStatus;
}

export function getStatus() {
  return status;
}

export function isRecording() {
  return status.state === 'recording';
}

export async function setStatus(nextStatus: RecordingStatus) {
  status = nextStatus;
  await chrome.storage.session.set({ [STATUS_STORAGE_KEY]: nextStatus });
}

async function restoreStatus() {
  const stored = await chrome.storage.session.get(STATUS_STORAGE_KEY);
  const storedStatus = stored[STATUS_STORAGE_KEY];

  if (isRecordingStatus(storedStatus)) {
    status = storedStatus;
  }
}
