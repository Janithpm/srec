const OFFSCREEN_URL = 'offscreen.html';

let creatingDocument: Promise<void> | null = null;

export function ensureOffscreenDocument() {
  creatingDocument ??= createOffscreenDocument().finally(() => {
    creatingDocument = null;
  });

  return creatingDocument;
}

export async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
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
