import {
  appendRecordingChunk,
  createRecordingBackup,
  deleteRecordingBackup,
  getRecordingBackupChunks,
  listRecordingBackups,
} from '@/utils/recording-backup';

type OffscreenControlMessage =
  | { type: 'START_OFFSCREEN_RECORDING'; streamId: string; startedAt: number }
  | { type: 'STOP_OFFSCREEN_RECORDING' }
  | { type: 'CANCEL_OFFSCREEN_RECORDING' }
  | { type: 'REVOKE_RECORDING_URL'; blobUrl: string }
  | { type: 'RECOVER_RECORDINGS' };

type RecoveredRecording = {
  blobUrl: string;
  filename: string;
  backupId: string;
};

const VIDEO_BITS_PER_SECOND = 3_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;
const KEYFRAME_INTERVAL_MS = 5000;
const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let chunks: BlobPart[] = [];
let backupId: string | null = null;
let backupWrites: Promise<void> = Promise.resolve();

chrome.runtime.onMessage.addListener((message: OffscreenControlMessage, _sender, sendResponse) => {
  if (!isOffscreenControlMessage(message)) {
    return false;
  }

  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendRecordingError(getErrorMessage(error));
      sendResponse({ ok: false, error: getErrorMessage(error) });
    });

  return true;
});

chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' }).catch(() => {});

async function handleMessage(message: OffscreenControlMessage) {
  switch (message.type) {
    case 'START_OFFSCREEN_RECORDING':
      await startRecording(message.streamId, message.startedAt);
      return { ok: true };

    case 'STOP_OFFSCREEN_RECORDING':
      stopRecording();
      return { ok: true };

    case 'CANCEL_OFFSCREEN_RECORDING':
      await discardRecording();
      return { ok: true };

    case 'REVOKE_RECORDING_URL':
      URL.revokeObjectURL(message.blobUrl);
      return { ok: true };

    case 'RECOVER_RECORDINGS':
      return { ok: true, recordings: await recoverRecordings() };
  }
}

function isOffscreenControlMessage(message: unknown): message is OffscreenControlMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  const type = (message as { type: unknown }).type;
  return (
    type === 'START_OFFSCREEN_RECORDING' ||
    type === 'STOP_OFFSCREEN_RECORDING' ||
    type === 'CANCEL_OFFSCREEN_RECORDING' ||
    type === 'REVOKE_RECORDING_URL' ||
    type === 'RECOVER_RECORDINGS'
  );
}

async function startRecording(streamId: string, startedAt: number) {
  if (mediaRecorder?.state === 'recording') {
    return;
  }

  chunks = [];

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });

  keepTabAudioAudible(mediaStream);

  mediaStream.getTracks().forEach((track) => track.addEventListener('ended', stopRecording));

  const mimeType = getSupportedMimeType();
  const options: MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } = {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    videoKeyFrameIntervalDuration: KEYFRAME_INTERVAL_MS,
  };
  const recorder = new MediaRecorder(mediaStream, options);
  mediaRecorder = recorder;
  const recordedMimeType = recorder.mimeType || 'video/webm';

  backupId = await startBackup(startedAt, recordedMimeType);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      backupChunk(event.data);
    }
  };

  recorder.onerror = () => {
    sendRecordingError('The recorder stopped unexpectedly.');
    discardRecording().catch(console.error);
  };

  recorder.onstop = () => {
    // cleanup() detaches the recorder when the recording is cancelled.
    if (recorder !== mediaRecorder) {
      return;
    }

    const blob = new Blob(chunks, { type: recordedMimeType });
    const blobUrl = URL.createObjectURL(blob);
    const savedBackupId = backupId;
    const pendingBackupWrites = backupWrites;

    cleanup();

    pendingBackupWrites
      .then(() =>
        chrome.runtime.sendMessage({
          type: 'RECORDING_STOPPED',
          blobUrl,
          filename: createRecordingFilename(new Date(), recordedMimeType),
          backupId: savedBackupId,
        }),
      )
      .catch(() => URL.revokeObjectURL(blobUrl));
  };

  recorder.start(1000);
  await chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });
}

function stopRecording() {
  if (!mediaRecorder) {
    cleanup();
    return;
  }

  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

async function discardRecording() {
  const discardedBackupId = backupId;
  const pendingBackupWrites = backupWrites;

  cleanup();

  if (discardedBackupId) {
    await pendingBackupWrites;
    await deleteRecordingBackup(discardedBackupId).catch(console.error);
  }
}

async function startBackup(startedAt: number, mimeType: string) {
  const id = crypto.randomUUID();

  try {
    await createRecordingBackup({ id, startedAt, mimeType });
    return id;
  } catch (error) {
    // Recording still works without a backup; it just can't be recovered after a crash.
    console.error('Could not create recording backup.', error);
    return null;
  }
}

function backupChunk(data: Blob) {
  const id = backupId;
  if (!id) {
    return;
  }

  backupWrites = backupWrites
    .then(() => appendRecordingChunk(id, data))
    .catch((error) => console.error('Could not back up recording chunk.', error));
}

async function recoverRecordings() {
  const recovered: RecoveredRecording[] = [];

  for (const backup of await listRecordingBackups()) {
    if (backup.id === backupId) {
      continue;
    }

    const backupChunks = await getRecordingBackupChunks(backup.id);
    if (backupChunks.length === 0) {
      await deleteRecordingBackup(backup.id);
      continue;
    }

    const blob = new Blob(backupChunks, { type: backup.mimeType });
    recovered.push({
      blobUrl: URL.createObjectURL(blob),
      filename: createRecordingFilename(new Date(backup.startedAt), backup.mimeType, '-recovered'),
      backupId: backup.id,
    });
  }

  return recovered;
}

function keepTabAudioAudible(stream: MediaStream) {
  if (stream.getAudioTracks().length === 0) {
    return;
  }

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);
}

function cleanup() {
  mediaRecorder = null;
  chunks = [];
  backupId = null;
  backupWrites = Promise.resolve();

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;

  audioContext?.close().catch(() => {});
  audioContext = null;
}

function getSupportedMimeType() {
  return MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

function createRecordingFilename(date: Date, mimeType: string, suffix = '') {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '-')
    .replaceAll(':', '-');

  const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  return `tab-recording-${timestamp}${suffix}.${extension}`;
}

function sendRecordingError(error: string) {
  chrome.runtime.sendMessage({ type: 'RECORDING_ERROR', error }).catch(() => {});
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Recording failed. Please try again.';
}
