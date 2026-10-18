import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, saveSettings, type Settings } from '@/utils/settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS));

    return onSettingsChanged(({ microphone }) => setSettings((current) => current && { ...current, microphone }));
  }, []);

  function updateSettings(changes: Partial<Settings>) {
    const nextSettings = { ...(settings ?? DEFAULT_SETTINGS), ...changes };
    setSettings(nextSettings);
    saveSettings(nextSettings).catch(console.error);
  }

  return { settings, updateSettings };
}
