import { sendOffscreenCommand } from '@/utils/messages';

export async function downloadRecording(blobUrl: string, filename: string) {
  try {
    await chrome.downloads.download({ url: blobUrl, filename, saveAs: false });
  } finally {
    await sendOffscreenCommand({ type: 'REVOKE_RECORDING_URL', blobUrl }).catch(() => {});
  }
}
