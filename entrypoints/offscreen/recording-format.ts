import { formatFileTimestamp } from '@/utils/file-timestamp';

const VIDEO_BITS_PER_SECOND = 3_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;
const KEYFRAME_INTERVAL_MS = 5000;

const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

type ChromeMediaRecorderOptions = MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number };

export function pickMimeType(excludedMimeTypes: ReadonlySet<string>) {
  return MIME_TYPES.find((type) => !excludedMimeTypes.has(type) && MediaRecorder.isTypeSupported(type));
}

export function getRecorderOptions(mimeType: string): ChromeMediaRecorderOptions {
  return {
    mimeType,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    videoKeyFrameIntervalDuration: KEYFRAME_INTERVAL_MS,
  };
}

export function createRecordingFilename(startedAt: number, mimeType: string, suffix = '') {
  const timestamp = formatFileTimestamp(startedAt);
  const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  return `tab-recording-${timestamp}${suffix}.${extension}`;
}
