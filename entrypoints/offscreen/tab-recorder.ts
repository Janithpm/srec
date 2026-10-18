import { sendToBackground } from '@/utils/messages';
import { appendRecordingChunk, createRecordingBackup, deleteRecordingBackup } from '@/utils/recording-backup';
import { createAudioMixer, type AudioMixer } from './audio-mixer';
import { captureTab, stopTracks } from './media';
import { createRecordingFilename, getRecordedMimeType, getRecorderOptions } from './recording-format';

const CHUNK_INTERVAL_MS = 1000;

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioMixer;
  startedAt: number;
  mimeType: string;
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
  current.recorder.ondataavailable = (event) => storeChunk(current, event.data);
  current.recorder.onerror = () => handleRecorderError();
  current.recorder.onstop = () => {
    if (session === current) {
      finishRecording(current);
    }
  };

  void current.audio.setMicrophone(microphone);
  current.backupId = await startBackup(startedAt, current.mimeType);

  if (session === current) {
    current.recorder.start(CHUNK_INTERVAL_MS);
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
    await deleteRecordingBackup(discarded.backupId).catch(console.error);
  }
}

function createSession(stream: MediaStream, startedAt: number): RecordingSession {
  let audio: AudioMixer | undefined;

  try {
    audio = createAudioMixer(stream);
    const recordedStream = new MediaStream([...stream.getVideoTracks(), audio.track]);
    const recorder = new MediaRecorder(recordedStream, getRecorderOptions());

    return {
      recorder,
      stream,
      audio,
      startedAt,
      mimeType: getRecordedMimeType(recorder),
      chunks: [],
      backupId: null,
      backupWrites: Promise.resolve(),
    };
  } catch (error) {
    stopTracks(stream);
    audio?.close();
    throw error;
  }
}

function finishRecording(finished: RecordingSession) {
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
      }),
    )
    .catch(() => URL.revokeObjectURL(blobUrl));
}

function handleRecorderError() {
  sendToBackground({ type: 'RECORDING_ERROR', error: 'The recorder stopped unexpectedly.' }).catch(() => {});
  discardRecording().catch(console.error);
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
    console.error('Could not create recording backup.', error);
    return null;
  }
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
      .catch((error) => console.error('Could not back up recording chunk.', error));
  }
}
