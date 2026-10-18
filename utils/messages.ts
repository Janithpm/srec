import type { RecordingStatus } from './recording-status';

export type PopupRequest = { type: 'GET_STATUS' } | { type: 'START_RECORDING' } | { type: 'STOP_RECORDING' };

export type RecordingStoppedEvent = {
  type: 'RECORDING_STOPPED';
  blobUrl: string;
  filename: string;
  backupId: string | null;
};

export type OffscreenEvent = RecordingStoppedEvent | { type: 'RECORDING_ERROR'; error: string };

export type BackgroundMessage = PopupRequest | OffscreenEvent;

export type OffscreenCommand =
  | { type: 'START_OFFSCREEN_RECORDING'; streamId: string; startedAt: number; microphone: boolean }
  | { type: 'SET_OFFSCREEN_MICROPHONE'; enabled: boolean }
  | { type: 'STOP_OFFSCREEN_RECORDING' }
  | { type: 'CANCEL_OFFSCREEN_RECORDING' }
  | { type: 'REVOKE_RECORDING_URL'; blobUrl: string }
  | { type: 'RECOVER_RECORDINGS' };

export type RecoveredRecording = {
  blobUrl: string;
  filename: string;
  backupId: string;
};

export type OffscreenResponse = { ok: true; recordings?: RecoveredRecording[] } | { ok: false; error: string };

type Target = 'background' | 'offscreen';

export function sendToBackground(message: BackgroundMessage): Promise<RecordingStatus | undefined> {
  return chrome.runtime.sendMessage({ ...message, target: 'background' });
}

export async function sendToOffscreen(command: OffscreenCommand) {
  const response: OffscreenResponse | undefined = await chrome.runtime.sendMessage({
    ...command,
    target: 'offscreen',
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'The recorder did not respond.');
  }

  return response;
}

export function isBackgroundMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): message is BackgroundMessage {
  return isTrustedMessageFor('background', message, sender);
}

export function isOffscreenCommand(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): message is OffscreenCommand {
  return isTrustedMessageFor('offscreen', message, sender);
}

function isTrustedMessageFor(target: Target, message: unknown, sender: chrome.runtime.MessageSender) {
  const isFromExtensionPage = sender.id === chrome.runtime.id && !sender.tab;
  return isFromExtensionPage && (message as { target?: unknown } | null)?.target === target;
}
