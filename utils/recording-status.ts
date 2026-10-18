export type RecordingState = 'idle' | 'recording' | 'error';

export type RecordingStatus = {
  state: RecordingState;
  startedAt: number | null;
  tabId: number | null;
  error: string | null;
};

export const IDLE_RECORDING_STATUS: RecordingStatus = {
  state: 'idle',
  startedAt: null,
  tabId: null,
  error: null,
};

export const RECORDING_STATUS_STORAGE_KEY = 'recordingStatus';

export function createErrorStatus(error: string): RecordingStatus {
  return { ...IDLE_RECORDING_STATUS, state: 'error', error };
}

export function onRecordingStatusChanged(callback: (status: RecordingStatus) => void) {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    const nextStatus = changes[RECORDING_STATUS_STORAGE_KEY]?.newValue as RecordingStatus | undefined;

    if (areaName === 'session' && nextStatus) {
      callback(nextStatus);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
