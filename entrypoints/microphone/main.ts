import { updateSettings } from '@/utils/settings';

type PermissionPageState = 'requesting' | 'granted' | 'denied';

const CLOSE_DELAY_MS = 1200;

const card = document.querySelector<HTMLElement>('.card')!;
const title = document.getElementById('title')!;
const message = document.getElementById('message')!;
const retryButton = document.getElementById('retry')!;

retryButton.addEventListener('click', requestMicrophone);
requestMicrophone();

async function requestMicrophone() {
  showState('requesting');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    showState('denied');
    return;
  }

  await updateSettings({ microphone: true });
  showState('granted');
  setTimeout(closeTab, CLOSE_DELAY_MS);
}

function showState(state: PermissionPageState) {
  card.dataset.state = state;
  retryButton.hidden = state !== 'denied';

  if (state === 'granted') {
    title.textContent = 'Microphone on';
    message.textContent = 'This tab will close.';
  } else if (state === 'denied') {
    title.textContent = 'Microphone blocked';
    message.textContent = 'Allow it from the icon in the address bar, then try again.';
  }
}

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();

  if (tab?.id !== undefined) {
    await chrome.tabs.remove(tab.id);
  }
}
