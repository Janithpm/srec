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

const RECORDING_STATES: readonly RecordingState[] = ['idle', 'recording', 'error'];

export function isRecordingStatus(value: unknown): value is RecordingStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as RecordingStatus;
  return (
    RECORDING_STATES.includes(candidate.state) &&
    isNumberOrNull(candidate.startedAt) &&
    isNumberOrNull(candidate.tabId) &&
    (typeof candidate.error === 'string' || candidate.error === null)
  );
}

function isNumberOrNull(value: unknown) {
  return typeof value === 'number' || value === null;
}
