import { getSettings, updateSettings } from './settings';

const PERMISSION_PAGE_PATH = '/microphone.html';

export async function getMicrophonePermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export async function openMicrophonePermissionPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL(PERMISSION_PAGE_PATH) });
}

export async function toggleMicrophone(): Promise<boolean | null> {
  const [{ microphone }, permission] = await Promise.all([getSettings(), getMicrophonePermission()]);

  if (permission !== 'granted') {
    await openMicrophonePermissionPage();
    return null;
  }

  await updateSettings({ microphone: !microphone });
  return !microphone;
}
