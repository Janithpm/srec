import { isRecording } from './status-store';

const RECORDING_BADGE_COLOR = '#dc2626';
const MICROPHONE_ON_BADGE_COLOR = '#2563eb';
const MICROPHONE_OFF_BADGE_COLOR = '#64748b';
const MICROPHONE_BADGE_DURATION_MS = 1500;

let microphoneBadgeTimer: ReturnType<typeof setTimeout> | null = null;

export async function showRecordingBadge() {
  await setBadge('REC', RECORDING_BADGE_COLOR);
}

export async function clearRecordingBadge() {
  await chrome.action.setBadgeText({ text: '' });
}

export async function flashMicrophoneBadge(enabled: boolean) {
  if (microphoneBadgeTimer) {
    clearTimeout(microphoneBadgeTimer);
  }

  await setBadge(enabled ? 'MIC' : 'OFF', enabled ? MICROPHONE_ON_BADGE_COLOR : MICROPHONE_OFF_BADGE_COLOR);

  microphoneBadgeTimer = setTimeout(() => {
    microphoneBadgeTimer = null;
    (isRecording() ? showRecordingBadge() : clearRecordingBadge()).catch(console.error);
  }, MICROPHONE_BADGE_DURATION_MS);
}

export async function setCloseWarning(tabId: number | null, enabled: boolean) {
  if (tabId === null) {
    return;
  }

  await chrome.scripting
    .executeScript({ target: { tabId }, func: toggleBeforeUnloadWarning, args: [enabled] })
    .catch(() => {});
}

async function setBadge(text: string, color: string) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

function toggleBeforeUnloadWarning(enabled: boolean) {
  const page = window as Window & { __srecBeforeUnload?: (event: BeforeUnloadEvent) => void };

  if (enabled && !page.__srecBeforeUnload) {
    page.__srecBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', page.__srecBeforeUnload);
  } else if (!enabled && page.__srecBeforeUnload) {
    window.removeEventListener('beforeunload', page.__srecBeforeUnload);
    delete page.__srecBeforeUnload;
  }
}
