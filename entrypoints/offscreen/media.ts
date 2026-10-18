export function captureTab(streamId: string) {
  const tabSource = {
    mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
  } as MediaTrackConstraints;

  return navigator.mediaDevices.getUserMedia({ audio: tabSource, video: tabSource });
}

export function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}
