import { stopTracks } from './media';

const MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export type AudioMixer = {
  track: MediaStreamTrack;
  setMicrophone: (enabled: boolean) => Promise<void>;
  close: () => void;
};

export function createAudioMixer(tabStream: MediaStream): AudioMixer {
  const context = new AudioContext();
  const output = context.createMediaStreamDestination();
  let microphone: { stream: MediaStream; source: MediaStreamAudioSourceNode } | null = null;
  let wantsMicrophone = false;
  let isClosed = false;

  if (tabStream.getAudioTracks().length > 0) {
    const tabAudio = context.createMediaStreamSource(tabStream);
    tabAudio.connect(context.destination);
    tabAudio.connect(output);
  }

  async function setMicrophone(enabled: boolean) {
    wantsMicrophone = enabled;

    if (!enabled) {
      releaseMicrophone();
    } else if (!microphone) {
      await openMicrophone();
    }
  }

  async function openMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);

      if (!wantsMicrophone || microphone || isClosed) {
        stopTracks(stream);
        return;
      }

      const source = context.createMediaStreamSource(stream);
      source.connect(output);
      microphone = { stream, source };
    } catch (error) {
      console.error('Could not open the microphone.', error);
    }
  }

  function releaseMicrophone() {
    if (microphone) {
      microphone.source.disconnect();
      stopTracks(microphone.stream);
      microphone = null;
    }
  }

  function close() {
    isClosed = true;
    releaseMicrophone();
    context.close().catch(() => {});
  }

  return { track: output.stream.getAudioTracks()[0], setMicrophone, close };
}
