import { sendToOffscreen } from '@/utils/messages';
import { getDownloadPath, getSettings } from '@/utils/settings';

type DownloadOutcome = 'complete' | 'canceled' | 'failed';

export async function downloadRecording(blobUrl: string, filename: string, { allowSaveAs = true } = {}) {
  const settings = await getSettings();
  const path = getDownloadPath(settings, filename);
  const saveAs = allowSaveAs && settings.saveLocation === 'ask';

  try {
    let outcome = await download(blobUrl, path, saveAs);

    if (outcome === 'canceled' && saveAs) {
      outcome = await download(blobUrl, path, false);
    }

    if (outcome !== 'complete') {
      throw new Error('The recording could not be saved.');
    }
  } finally {
    await sendToOffscreen({ type: 'REVOKE_RECORDING_URL', blobUrl }).catch(() => {});
  }
}

async function download(url: string, filename: string, saveAs: boolean) {
  const downloadId = await chrome.downloads.download({ url, filename, saveAs });
  return waitForDownload(downloadId);
}

function waitForDownload(downloadId: number) {
  return new Promise<DownloadOutcome>((resolve) => {
    function finish(state: string | undefined, error: string | undefined) {
      if (state === 'complete') {
        done('complete');
      } else if (state === 'interrupted') {
        done(error === 'USER_CANCELED' ? 'canceled' : 'failed');
      }
    }

    function done(outcome: DownloadOutcome) {
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve(outcome);
    }

    function onChanged(delta: chrome.downloads.DownloadDelta) {
      if (delta.id === downloadId) {
        finish(delta.state?.current, delta.error?.current);
      }
    }

    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads
      .search({ id: downloadId })
      .then(([item]) => finish(item?.state, item?.error))
      .catch(console.error);
  });
}
