import { useEffect, useState } from 'react';

const TICK_INTERVAL_MS = 500;

export function useElapsedTime(startedAt: number | null) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (startedAt === null) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? formatElapsedTime(0) : formatElapsedTime(now - startedAt);
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}
