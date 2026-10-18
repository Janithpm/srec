const OFFSCREEN_URL = 'offscreen.html';

const holders = new Set<string>();
let creatingDocument: Promise<void> | null = null;

export async function holdOffscreenDocument(holder: string) {
  holders.add(holder);
  creatingDocument ??= createOffscreenDocument().finally(() => {
    creatingDocument = null;
  });
  await creatingDocument;
}

export async function releaseOffscreenDocument(holder: string) {
  holders.delete(holder);

  if (holders.size === 0 && (await hasOffscreenDocument())) {
    await chrome.offscreen.closeDocument();
  }
}

async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS],
    justification: 'Record the selected browser tab with audio and save recordings.',
  });
}

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  return contexts.length > 0;
}
