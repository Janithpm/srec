const VIDEO_BITS_PER_SECOND = 3_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;
const KEYFRAME_INTERVAL_MS = 5000;
const FALLBACK_MIME_TYPE = 'video/webm';

// In order of preference; the first one the browser supports is used.
const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

type ChromeMediaRecorderOptions = MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number };

export function getRecorderOptions(): ChromeMediaRecorderOptions {
  const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));

  return {
    mimeType,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    videoKeyFrameIntervalDuration: KEYFRAME_INTERVAL_MS,
  };
}

export function getRecordedMimeType(recorder: MediaRecorder) {
  return recorder.mimeType || FALLBACK_MIME_TYPE;
}

export function createRecordingFilename(startedAt: number, mimeType: string, suffix = '') {
  const timestamp = new Date(startedAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '-')
    .replaceAll(':', '-');

  const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  return `tab-recording-${timestamp}${suffix}.${extension}`;
}
