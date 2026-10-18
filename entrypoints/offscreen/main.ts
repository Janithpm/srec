import { getErrorMessage } from '@/utils/errors';
import { isOffscreenCommand, type OffscreenCommand, type OffscreenResponse } from '@/utils/messages';
import { recoverRecordings } from './recovery';
import { discardRecording, startRecording, stopRecording } from './tab-recorder';

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenCommand(message)) {
    return false;
  }

  handleCommand(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) } satisfies OffscreenResponse));

  return true;
});

async function handleCommand(command: OffscreenCommand): Promise<OffscreenResponse> {
  switch (command.type) {
    case 'START_OFFSCREEN_RECORDING':
      await startRecording(command.streamId, command.startedAt);
      break;

    case 'STOP_OFFSCREEN_RECORDING':
      stopRecording();
      break;

    case 'CANCEL_OFFSCREEN_RECORDING':
      await discardRecording();
      break;

    case 'REVOKE_RECORDING_URL':
      URL.revokeObjectURL(command.blobUrl);
      break;

    case 'RECOVER_RECORDINGS':
      return { ok: true, recordings: await recoverRecordings() };
  }

  return { ok: true };
}
