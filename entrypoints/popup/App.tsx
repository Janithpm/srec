import { useElapsedTime } from './useElapsedTime';
import { useRecorder } from './useRecorder';
import './App.css';

function App() {
  const { status, isBusy, startRecording, stopRecording } = useRecorder();
  const isRecording = status.state === 'recording';
  const elapsedTime = useElapsedTime(isRecording ? status.startedAt : null);

  return (
    <main className="recorder">
      <header className="recorder__header">
        <div>
          <p className="recorder__eyebrow">SREC</p>
          <h1>{elapsedTime}</h1>
        </div>
        <span className={`status status--${status.state}`}>
          {isRecording ? 'REC' : status.state}
        </span>
      </header>

      <div className="recorder__actions">
        <button
          className={`button ${isRecording ? 'button--stop' : 'button--start'}`}
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
        >
          {isRecording ? 'Stop' : 'Start'}
        </button>
      </div>

      {status.state === 'error' && status.error && (
        <p className="recorder__error">{status.error}</p>
      )}
    </main>
  );
}

export default App;
