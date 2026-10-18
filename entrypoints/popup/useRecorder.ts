import { useEffect, useState } from 'react';
import { sendToBackground, type PopupRequest } from '@/utils/messages';
import {
  createErrorStatus,
  IDLE_RECORDING_STATUS,
  onRecordingStatusChanged,
  type RecordingStatus,
} from '@/utils/recording-status';

export function useRecorder() {
  const [status, setStatus] = useState<RecordingStatus>(IDLE_RECORDING_STATUS);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    request({ type: 'GET_STATUS' }).then(setStatus);
    return onRecordingStatusChanged(setStatus);
  }, []);

  async function requestWhileBusy(message: PopupRequest) {
    setIsBusy(true);
    setStatus(await request(message));
    setIsBusy(false);
  }

  return {
    status,
    isBusy,
    startRecording: () => requestWhileBusy({ type: 'START_RECORDING' }),
    stopRecording: () => requestWhileBusy({ type: 'STOP_RECORDING' }),
  };
}

async function request(message: PopupRequest) {
  const status = await sendToBackground(message).catch(() => undefined);
  return status ?? createErrorStatus('Could not reach the recorder.');
}
