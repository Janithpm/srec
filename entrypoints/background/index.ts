import { getErrorMessage } from '@/utils/errors';
import { isBackgroundMessage, type BackgroundMessage, type PopupResponse } from '@/utils/messages';
import { failRecording, saveRecording, startRecording, stopRecording } from './recording';
import { recoverInterruptedRecordings } from './recovery';
import { ensureStatusLoaded, getStatus, isRecording } from './status-store';
import { setCloseWarning } from './tab-indicators';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isBackgroundMessage(message)) {
      return false;
    }

    handleMessage(message)
      .then(sendResponse)
      .catch(async (error) => {
        const errorMessage = getErrorMessage(error);
        await failRecording(errorMessage).catch(console.error);
        sendResponse({ ok: false, error: errorMessage, status: getStatus() } satisfies PopupResponse);
      });

    return true;
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') {
      return;
    }

    ensureStatusLoaded()
      .then(() => {
        if (isRecording() && getStatus().tabId === tabId) {
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

async function handleMessage(message: BackgroundMessage): Promise<PopupResponse> {
  await ensureStatusLoaded();

  switch (message.type) {
    case 'START_RECORDING':
      await startRecording();
      break;

    case 'STOP_RECORDING':
      await stopRecording();
      break;

    case 'RECORDING_STOPPED':
      await saveRecording(message);
      break;

    case 'RECORDING_ERROR':
      await failRecording(message.error);
      break;
  }

  return { ok: true, status: getStatus() };
}
