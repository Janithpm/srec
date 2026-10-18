const BADGE_COLOR = '#dc2626';

export async function showRecordingBadge() {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: 'REC' });
}

export async function clearRecordingBadge() {
  await chrome.action.setBadgeText({ text: '' });
}

export async function setCloseWarning(tabId: number | null, enabled: boolean) {
  if (tabId === null) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: toggleBeforeUnloadWarning,
      args: [enabled],
    });
  } catch {}
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
