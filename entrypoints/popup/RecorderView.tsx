import { toggleMicrophone } from '@/utils/microphone';
import type { Settings } from '@/utils/settings';
import { MicIcon, MicOffIcon, SettingsIcon } from './icons';
import { useElapsedTime } from './useElapsedTime';
import { useMicrophonePermission } from './useMicrophonePermission';
import { useRecorder } from './useRecorder';
import type { Shortcuts } from './useShortcuts';

type RecorderViewProps = {
  settings: Settings | null;
  shortcuts: Shortcuts | null;
  onOpenSettings: () => void;
};

export function RecorderView({ settings, shortcuts, onOpenSettings }: RecorderViewProps) {
  const { status, isBusy, startRecording, stopRecording } = useRecorder();
  const microphonePermission = useMicrophonePermission();
  const isRecording = status.state === 'recording';
  const isMicrophoneOn = !!settings?.microphone && microphonePermission === 'granted';
  const elapsedTime = useElapsedTime(isRecording ? status.startedAt : null);
  const recordLabel = isRecording ? 'Stop' : 'Record';

  return (
    <main className="recorder">
      <header className="recorder__header">
        <div className={`timer${isRecording ? ' timer--live' : ''}`}>
          <span className="timer__dot" aria-hidden="true" />
          <span className="timer__time">{elapsedTime}</span>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
          data-autofocus
        >
          <SettingsIcon />
        </button>
      </header>

      <div className="controls">
        <button
          className={`record-button${isRecording ? ' record-button--stop' : ''}`}
          type="button"
          title={withShortcut(recordLabel, shortcuts?.toggleRecording)}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
        >
          <span className="record-button__icon" aria-hidden="true" />
          {recordLabel}
        </button>
        <button
          className={`mic-button${isMicrophoneOn ? ' mic-button--on' : ''}`}
          type="button"
          aria-label="Microphone"
          aria-pressed={isMicrophoneOn}
          title={withShortcut(isMicrophoneOn ? 'Microphone on' : 'Microphone off', shortcuts?.toggleMicrophone)}
          onClick={() => toggleMicrophone().catch(console.error)}
          disabled={!settings || microphonePermission === null}
        >
          {isMicrophoneOn ? <MicIcon /> : <MicOffIcon />}
        </button>
      </div>

      {status.state === 'error' && status.error && (
        <p className="recorder__error" role="alert">
          {status.error}
        </p>
      )}
    </main>
  );
}

function withShortcut(label: string, shortcut: string | undefined) {
  return shortcut ? `${label} (${shortcut})` : label;
}
