type OffscreenControlMessage =
  | { type: 'START_OFFSCREEN_RECORDING'; streamId: string; startedAt: number }
  | { type: 'STOP_OFFSCREEN_RECORDING' }
  | { type: 'CANCEL_OFFSCREEN_RECORDING' }
  | { type: 'REVOKE_RECORDING_URL'; blobUrl: string };

const VIDEO_BITS_PER_SECOND = 12_000_000;
const AUDIO_BITS_PER_SECOND = 192_000;

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let chunks: BlobPart[] = [];
let isStopping = false;

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
      await startRecording(message.streamId);
      return { ok: true };

    case 'STOP_OFFSCREEN_RECORDING':
      stopRecording();
      return { ok: true };

    case 'CANCEL_OFFSCREEN_RECORDING':
      cleanup();
      return { ok: true };

    case 'REVOKE_RECORDING_URL':
      URL.revokeObjectURL(message.blobUrl);
      return { ok: true };
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
    type === 'REVOKE_RECORDING_URL'
  );
}

async function startRecording(streamId: string) {
  if (mediaRecorder?.state === 'recording') {
    return;
  }

  chunks = [];
  isStopping = false;

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

  const mimeType = getSupportedMimeType();
  mediaRecorder = new MediaRecorder(mediaStream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onerror = () => {
    sendRecordingError('The recorder stopped unexpectedly.');
    cleanup();
  };

  mediaRecorder.onstop = () => {
    if (!isStopping) {
      cleanup();
      return;
    }

    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'video/webm' });
    const blobUrl = URL.createObjectURL(blob);

    cleanup();

    chrome.runtime
      .sendMessage({
        type: 'RECORDING_STOPPED',
        blobUrl,
        filename: createRecordingFilename(),
      })
      .catch(() => URL.revokeObjectURL(blobUrl));
  };

  mediaRecorder.start(1000);
  await chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    cleanup();
    return;
  }

  isStopping = true;
  mediaRecorder.stop();
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
  isStopping = false;
  chunks = [];

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;

  audioContext?.close().catch(() => {});
  audioContext = null;
}

function getSupportedMimeType() {
  const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm'];
  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

function createRecordingFilename() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '-')
    .replaceAll(':', '-');

  return `tab-recording-${timestamp}.webm`;
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
