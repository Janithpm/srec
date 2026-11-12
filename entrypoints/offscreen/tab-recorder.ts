import { sendToBackground } from '@/utils/messages';
import { appendRecordingChunk, createRecordingBackup, deleteRecordingBackup } from '@/utils/recording-backup';
import { createAudioMixer, type AudioMixer } from './audio-mixer';
import { logger } from './logger';
import { captureTab, stopTracks } from './media';
import { createRecordingFilename, getRecorderOptions, pickMimeType } from './recording-format';

const CHUNK_INTERVAL_MS = 1000;

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioMixer;
  startedAt: number;
  mimeType: string;
  failedMimeTypes: Set<string>;
  chunks: Blob[];
  backupId: string | null;
  backupWrites: Promise<void>;
};

let session: RecordingSession | null = null;

export function getActiveBackupId() {
  return session?.backupId ?? null;
}

export async function startRecording(streamId: string, startedAt: number, microphone: boolean) {
  if (session) {
    return;
  }

  const stream = await captureTab(streamId);
  const current = createSession(stream, startedAt);
  session = current;

  stream.getTracks().forEach((track) => track.addEventListener('ended', stopRecording));

  void current.audio.setMicrophone(microphone);
  current.backupId = await startBackup(startedAt, current.mimeType);

  if (session === current) {
    if (!startRecorder(current)) {
      throw new Error('The recorder could not start.');
    }

    logger.info(`Recording as ${current.mimeType}.`);
  }
}

export async function setMicrophone(enabled: boolean) {
  await session?.audio.setMicrophone(enabled);
}

export function stopRecording() {
  if (session && session.recorder.state !== 'inactive') {
    session.recorder.stop();
  }
}

export async function discardRecording() {
  const discarded = session;
  if (!discarded) {
    return;
  }

  endSession(discarded);

  if (discarded.backupId) {
    await discarded.backupWrites;
    await deleteRecordingBackup(discarded.backupId).catch((error) =>
      logger.warn('Could not delete the recording backup.', error),
    );
  }
}

function createSession(stream: MediaStream, startedAt: number): RecordingSession {
  let audio: AudioMixer | undefined;

  try {
    const mimeType = pickMimeType(new Set());
    if (!mimeType) {
      throw new Error('This browser cannot record video.');
    }

    audio = createAudioMixer(stream);
    const created: RecordingSession = {
      recorder: createRecorder(stream, audio, mimeType),
      stream,
      audio,
      startedAt,
      mimeType,
      failedMimeTypes: new Set(),
      chunks: [],
      backupId: null,
      backupWrites: Promise.resolve(),
    };

    attachRecorder(created);
    return created;
  } catch (error) {
    stopTracks(stream);
    audio?.close();
    throw error;
  }
}

function createRecorder(stream: MediaStream, audio: AudioMixer, mimeType: string) {
  const recordedStream = new MediaStream([...stream.getVideoTracks(), audio.track]);
  return new MediaRecorder(recordedStream, getRecorderOptions(mimeType));
}

function attachRecorder(current: RecordingSession) {
  const { recorder } = current;

  recorder.ondataavailable = (event) => storeChunk(current, event.data);
  recorder.onerror = (event) => handleRecorderError(current, event);
  recorder.onstop = () => {
    if (session === current) {
      finishRecording(current);
    }
  };
}

function detachRecorder(recorder: MediaRecorder) {
  recorder.ondataavailable = null;
  recorder.onerror = null;
  recorder.onstop = null;

  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
}

function startRecorder(current: RecordingSession) {
  for (;;) {
    try {
      current.recorder.start(CHUNK_INTERVAL_MS);
      return true;
    } catch (error) {
      logger.error(`Could not start recording as ${current.mimeType}.`, error);

      if (!switchToFallbackFormat(current)) {
        return false;
      }
    }
  }
}

function switchToFallbackFormat(current: RecordingSession) {
  detachRecorder(current.recorder);
  current.failedMimeTypes.add(current.mimeType);

  const mimeType = pickMimeType(current.failedMimeTypes);
  if (!mimeType) {
    return false;
  }

  try {
    current.recorder = createRecorder(current.stream, current.audio, mimeType);
  } catch (error) {
    logger.error(`Could not create a recorder for ${mimeType}.`, error);
    return false;
  }

  logger.warn(`Falling back from ${current.mimeType} to ${mimeType}.`);
  current.mimeType = mimeType;
  attachRecorder(current);
  updateBackupFormat(current);
  return true;
}

function finishRecording(finished: RecordingSession, error?: string) {
  endSession(finished);

  const blob = new Blob(finished.chunks, { type: finished.mimeType });
  const blobUrl = URL.createObjectURL(blob);

  finished.backupWrites
    .then(() =>
      sendToBackground({
        type: 'RECORDING_STOPPED',
        blobUrl,
        filename: createRecordingFilename(finished.startedAt, finished.mimeType),
        backupId: finished.backupId,
        error,
      }),
    )
    .catch(() => URL.revokeObjectURL(blobUrl));
}

function handleRecorderError(current: RecordingSession, event: Event) {
  if (session !== current) {
    return;
  }

  const detail = describeRecorderError(event);
  logger.error(`Recording as ${current.mimeType} failed.`, detail || event);
  detachRecorder(current.recorder);

  if (current.chunks.length === 0 && switchToFallbackFormat(current) && startRecorder(current)) {
    return;
  }

  const error = `The recorder stopped unexpectedly${detail ? ` (${detail})` : ''}.`;

  if (current.chunks.length > 0) {
    finishRecording(current, `${error} The part recorded before it stopped was saved.`);
    return;
  }

  sendToBackground({ type: 'RECORDING_ERROR', error }).catch(() => {});
  discardRecording().catch((error) => logger.error('Could not discard the recording.', error));
}

function describeRecorderError(event: Event) {
  const { error } = event as Event & { error?: unknown };

  if (error instanceof Error) {
    return [error.name, error.message].filter(Boolean).join(': ');
  }

  return event instanceof ErrorEvent ? event.message : '';
}

function endSession(ended: RecordingSession) {
  session = null;
  stopTracks(ended.stream);
  ended.audio.close();
}

async function startBackup(startedAt: number, mimeType: string) {
  const id = crypto.randomUUID();

  try {
    await createRecordingBackup({ id, startedAt, mimeType });
    return id;
  } catch (error) {
    logger.error('Could not create recording backup.', error);
    return null;
  }
}

function updateBackupFormat(recording: RecordingSession) {
  const { backupId, startedAt, mimeType } = recording;
  if (!backupId) {
    return;
  }

  recording.backupWrites = recording.backupWrites
    .then(() => createRecordingBackup({ id: backupId, startedAt, mimeType }))
    .catch((error) => logger.error('Could not update recording backup.', error));
}

function storeChunk(recording: RecordingSession, data: Blob) {
  if (data.size === 0) {
    return;
  }

  recording.chunks.push(data);

  const { backupId } = recording;
  if (backupId) {
    recording.backupWrites = recording.backupWrites
      .then(() => appendRecordingChunk(backupId, data))
      .catch((error) => logger.error('Could not back up recording chunk.', error));
  }
}
