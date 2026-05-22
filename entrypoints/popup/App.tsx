import { useEffect, useMemo, useState } from 'react';
import './App.css';

type RecordingStatus = {
  state: 'idle' | 'recording' | 'error';
  startedAt: number | null;
  error: string | null;
};

type BackgroundResponse = {
  ok: boolean;
  status?: RecordingStatus;
  error?: string;
};

const idleStatus: RecordingStatus = {
  state: 'idle',
  startedAt: null,
  error: null,
};

function App() {
  const [statusSnapshot, setStatus] = useState<RecordingStatus>();
  const [now, setNow] = useState(() => Date.now());
  const [isBusy, setIsBusy] = useState(false);
  const status = statusSnapshot ?? idleStatus;

  const elapsedTime = useMemo(() => {
    if (status.state !== 'recording' || !status.startedAt) {
      return '00:00';
    }

    return formatElapsedTime(now - status.startedAt);
  }, [now, status.startedAt, status.state]);

  useEffect(() => {
    getStatus();
  }, []);

  useEffect(() => {
    if (status.state !== 'recording') {
      setNow(Date.now());
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, [status.state]);

  async function getStatus() {
    const response = await sendMessage({ type: 'GET_STATUS' });
    applyResponse(response);
  }

  async function startRecording() {
    setIsBusy(true);
    const response = await sendMessage({ type: 'START_RECORDING' });
    applyResponse(response);
    setIsBusy(false);
  }

  async function stopRecording() {
    setIsBusy(true);
    const response = await sendMessage({ type: 'STOP_RECORDING' });
    applyResponse(response);
    setIsBusy(false);
  }

  function applyResponse(response: BackgroundResponse) {
    if (response.status) {
      setStatus(response.status);
      return;
    }

    if (!response.ok) {
      setStatus({
        state: 'error',
        startedAt: null,
        error: response.error ?? 'Recording failed. Please try again.',
      });
    }
  }

  return (
    <main className="recorder">
      <header className="recorder__header">
        <div>
          <p className="recorder__eyebrow">Tab Recorder</p>
          <h1>{elapsedTime}</h1>
        </div>
        <span className={`status status--${status.state}`}>
          {status.state === 'recording' ? 'REC' : status.state}
        </span>
      </header>

      <div className="recorder__actions">
        {status.state === 'recording' ? (
          <button
            className="button button--stop"
            type="button"
            onClick={stopRecording}
            disabled={isBusy}
          >
            Stop
          </button>
        ) : (
          <button
            className="button button--start"
            type="button"
            onClick={startRecording}
            disabled={isBusy}
          >
            Start
          </button>
        )}
      </div>

      {status.state === 'error' && status.error ? (
        <p className="recorder__error">{status.error}</p>
      ) : null}
    </main>
  );
}

async function sendMessage(message: { type: string }): Promise<BackgroundResponse> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not reach the recorder.',
    };
  }
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default App;
