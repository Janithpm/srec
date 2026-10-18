import { TOGGLE_MICROPHONE_COMMAND, TOGGLE_RECORDING_COMMAND } from '@/utils/commands';
import { getErrorMessage } from '@/utils/errors';
import { isBackgroundMessage, type BackgroundMessage } from '@/utils/messages';
import { toggleMicrophone } from '@/utils/microphone';
import { onSettingsChanged } from '@/utils/settings';
import { failRecording, saveRecording, setRecordingMicrophone, startRecording, stopRecording } from './recording';
import { recoverInterruptedRecordings } from './recovery';
import { ensureStatusLoaded, getStatus, isRecording } from './status-store';
import { flashMicrophoneBadge, setCloseWarning } from './tab-indicators';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isBackgroundMessage(message, sender)) {
      return false;
    }

    handleMessage(message)
      .catch(reportFailure)
      .then(() => sendResponse(getStatus()));

    return true;
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === TOGGLE_RECORDING_COMMAND) {
      toggleRecording().catch(reportFailure);
    } else if (command === TOGGLE_MICROPHONE_COMMAND) {
      toggleMicrophoneWithBadge().catch(console.error);
    }
  });

  onSettingsChanged((settings, previous) => {
    if (settings.microphone !== previous.microphone) {
      ensureStatusLoaded()
        .then(() => setRecordingMicrophone(settings.microphone))
        .catch(console.error);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      restoreCloseWarning(tabId).catch(console.error);
    }
  });

  chrome.runtime.onStartup.addListener(() => {
    recoverInterruptedRecordings().catch(console.error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    recoverInterruptedRecordings().catch(console.error);
  });
});

async function handleMessage(message: BackgroundMessage) {
  await ensureStatusLoaded();

  switch (message.type) {
    case 'START_RECORDING':
      return startRecording();
    case 'STOP_RECORDING':
      return stopRecording();
    case 'RECORDING_STOPPED':
      return saveRecording(message);
    case 'RECORDING_ERROR':
      return failRecording(message.error);
  }
}

async function toggleRecording() {
  await ensureStatusLoaded();
  await (isRecording() ? stopRecording() : startRecording());
}

async function toggleMicrophoneWithBadge() {
  await ensureStatusLoaded();
  const enabled = await toggleMicrophone();

  if (enabled !== null) {
    await flashMicrophoneBadge(enabled);
  }
}

async function restoreCloseWarning(tabId: number) {
  await ensureStatusLoaded();

  if (isRecording() && getStatus().tabId === tabId) {
    await setCloseWarning(tabId, true);
  }
}

async function reportFailure(error: unknown) {
  await failRecording(getErrorMessage(error)).catch(console.error);
}
