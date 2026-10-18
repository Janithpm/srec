import { notifyBackground } from '@/utils/messages';
import {
  appendRecordingChunk,
  createRecordingBackup,
  deleteRecordingBackup,
} from '@/utils/recording-backup';
import { createRecordingFilename, getRecordedMimeType, getRecorderOptions } from './recording-format';

const CHUNK_INTERVAL_MS = 1000;

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioContext: AudioContext | null;
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

export async function startRecording(streamId: string, startedAt: number) {
  if (session) {
    return;
  }

  const stream = await captureTab(streamId);
  const recorder = new MediaRecorder(stream, getRecorderOptions());
  const mimeType = getRecordedMimeType(recorder);

  const current: RecordingSession = {
    recorder,
    stream,
    audioContext: keepTabAudioAudible(stream),
    startedAt,
    mimeType,
    chunks: [],
    backupId: null,
    backupWrites: Promise.resolve(),
  };
  session = current;

  // The tab stream ends when the recorded tab is closed.
  stream.getTracks().forEach((track) => track.addEventListener('ended', stopRecording));

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      current.chunks.push(event.data);
      backUpChunk(current, event.data);
    }
  };

  recorder.onerror = () => {
    notifyBackground({ type: 'RECORDING_ERROR', error: 'The recorder stopped unexpectedly.' }).catch(
      () => {},
    );
    discardRecording().catch(console.error);
  };

  recorder.onstop = () => {
    // A discarded session has already been released.
    if (session === current) {
      finishRecording(current);
    }
  };

  current.backupId = await startBackup(startedAt, mimeType);
  if (session === current) {
    recorder.start(CHUNK_INTERVAL_MS);
  }
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

function finishRecording(finished: RecordingSession) {
  endSession(finished);

  const blob = new Blob(finished.chunks, { type: finished.mimeType });
  const blobUrl = URL.createObjectURL(blob);

  // Report the recording only once every chunk is backed up, because the
  // background deletes the backup after the download starts.
  finished.backupWrites
    .then(() =>
      notifyBackground({
        type: 'RECORDING_STOPPED',
        blobUrl,
        filename: createRecordingFilename(finished.startedAt, finished.mimeType),
        backupId: finished.backupId,
      }),
    )
    .catch(() => URL.revokeObjectURL(blobUrl));
}

function endSession(ended: RecordingSession) {
  session = null;
  ended.stream.getTracks().forEach((track) => track.stop());
  ended.audioContext?.close().catch(() => {});
}

function captureTab(streamId: string) {
  const tabSource = {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    },
  } as MediaTrackConstraints;

  return navigator.mediaDevices.getUserMedia({ audio: tabSource, video: tabSource });
}

// Capturing a tab mutes it for the user, so route the audio back to the speakers.
function keepTabAudioAudible(stream: MediaStream) {
  if (stream.getAudioTracks().length === 0) {
    return null;
  }

  const audioContext = new AudioContext();
  audioContext.createMediaStreamSource(stream).connect(audioContext.destination);
  return audioContext;
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

function backUpChunk(recording: RecordingSession, data: Blob) {
  const { backupId } = recording;
  if (!backupId) {
    return;
  }

  recording.backupWrites = recording.backupWrites
    .then(() => appendRecordingChunk(backupId, data))
    .catch((error) => console.error('Could not back up recording chunk.', error));
}
