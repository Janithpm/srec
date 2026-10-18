import { useEffect, useState } from 'react';
import { getErrorMessage } from '@/utils/errors';
import type { PopupRequest, PopupResponse } from '@/utils/messages';
import { IDLE_RECORDING_STATUS, type RecordingStatus } from '@/utils/recording-status';

export function useRecorder() {
  const [status, setStatus] = useState<RecordingStatus>(IDLE_RECORDING_STATUS);
  const [isBusy, setIsBusy] = useState(false);

  async function request(message: PopupRequest) {
    const response = await sendToBackground(message);

    if (response.status) {
      setStatus(response.status);
    } else if (!response.ok) {
      setStatus({ ...IDLE_RECORDING_STATUS, state: 'error', error: response.error });
    }
  }

  async function requestWhileBusy(message: PopupRequest) {
    setIsBusy(true);
    await request(message);
    setIsBusy(false);
  }

  useEffect(() => {
    request({ type: 'GET_STATUS' });
  }, []);

  return {
    status,
    isBusy,
    startRecording: () => requestWhileBusy({ type: 'START_RECORDING' }),
    stopRecording: () => requestWhileBusy({ type: 'STOP_RECORDING' }),
  };
}

async function sendToBackground(message: PopupRequest): Promise<PopupResponse> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, 'Could not reach the recorder.') };
  }
}
