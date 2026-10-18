import { useEffect, useState } from 'react';
import { TOGGLE_MICROPHONE_COMMAND, TOGGLE_RECORDING_COMMAND } from '@/utils/commands';

export type Shortcuts = {
  toggleRecording: string;
  toggleMicrophone: string;
};

const NO_SHORTCUTS: Shortcuts = { toggleRecording: '', toggleMicrophone: '' };
const MAC_MODIFIERS = /^[⌃⌥⇧⌘]*/;

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcuts | null>(null);

  useEffect(() => {
    chrome.commands
      .getAll()
      .then((commands) => {
        const shortcutFor = (name: string) => commands.find((command) => command.name === name)?.shortcut ?? '';

        setShortcuts({
          toggleRecording: shortcutFor(TOGGLE_RECORDING_COMMAND),
          toggleMicrophone: shortcutFor(TOGGLE_MICROPHONE_COMMAND),
        });
      })
      .catch(() => setShortcuts(NO_SHORTCUTS));
  }, []);

  return shortcuts;
}

export function splitShortcut(shortcut: string) {
  if (shortcut.includes('+')) {
    return shortcut.split('+');
  }

  const modifiers = shortcut.match(MAC_MODIFIERS)?.[0] ?? '';
  return [...modifiers, shortcut.slice(modifiers.length)].filter(Boolean);
}
