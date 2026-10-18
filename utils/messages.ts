import type { RecordingStatus } from './recording-status';

// Popup -> background
export type PopupRequest =
  | { type: 'GET_STATUS' }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' };

export type PopupResponse =
  | { ok: true; status: RecordingStatus }
  | { ok: false; error: string; status?: RecordingStatus };

// Offscreen -> background
export type OffscreenEvent =
  | { type: 'RECORDING_STOPPED'; blobUrl: string; filename: string; backupId: string | null }
  | { type: 'RECORDING_ERROR'; error: string };

export type BackgroundMessage = PopupRequest | OffscreenEvent;

// Background -> offscreen
export type OffscreenCommand =
  | { type: 'START_OFFSCREEN_RECORDING'; streamId: string; startedAt: number }
  | { type: 'STOP_OFFSCREEN_RECORDING' }
  | { type: 'CANCEL_OFFSCREEN_RECORDING' }
  | { type: 'REVOKE_RECORDING_URL'; blobUrl: string }
  | { type: 'RECOVER_RECORDINGS' };

export type RecoveredRecording = {
  blobUrl: string;
  filename: string;
  backupId: string;
};

export type OffscreenResponse =
  | { ok: true; recordings?: RecoveredRecording[] }
  | { ok: false; error: string };

const BACKGROUND_MESSAGE_TYPES: readonly BackgroundMessage['type'][] = [
  'GET_STATUS',
  'START_RECORDING',
  'STOP_RECORDING',
  'RECORDING_STOPPED',
  'RECORDING_ERROR',
];

const OFFSCREEN_COMMAND_TYPES: readonly OffscreenCommand['type'][] = [
  'START_OFFSCREEN_RECORDING',
  'STOP_OFFSCREEN_RECORDING',
  'CANCEL_OFFSCREEN_RECORDING',
  'REVOKE_RECORDING_URL',
  'RECOVER_RECORDINGS',
];

export function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  return hasType(message, BACKGROUND_MESSAGE_TYPES);
}

export function isOffscreenCommand(message: unknown): message is OffscreenCommand {
  return hasType(message, OFFSCREEN_COMMAND_TYPES);
}

export async function sendOffscreenCommand(command: OffscreenCommand) {
  const response: OffscreenResponse | undefined = await chrome.runtime.sendMessage(command);

  if (!response?.ok) {
    throw new Error(response?.error ?? 'The recorder did not respond.');
  }

  return response;
}

export async function notifyBackground(event: OffscreenEvent) {
  await chrome.runtime.sendMessage(event);
}

function hasType(message: unknown, types: readonly string[]) {
  return (
    !!message &&
    typeof message === 'object' &&
    'type' in message &&
    types.includes((message as { type: unknown }).type as string)
  );
}
