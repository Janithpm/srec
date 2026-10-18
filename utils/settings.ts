export type SaveLocation = 'downloads' | 'subfolder' | 'ask';

export type Settings = {
  saveLocation: SaveLocation;
  subfolder: string;
  microphone: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  saveLocation: 'downloads',
  subfolder: 'SREC',
  microphone: false,
};

const SETTINGS_STORAGE_KEY = 'settings';
const SAVE_LOCATIONS: readonly SaveLocation[] = ['downloads', 'subfolder', 'ask'];
const INVALID_PATH_CHARACTERS = /[<>:"|?*\u0000-\u001f]/g;
const EDGE_DOTS_AND_SPACES = /^[.\s]+|[.\s]+$/g;

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export async function updateSettings(changes: Partial<Settings>) {
  await saveSettings({ ...(await getSettings()), ...changes });
}

export function onSettingsChanged(callback: (settings: Settings, previous: Settings) => void) {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    const change = changes[SETTINGS_STORAGE_KEY];

    if (areaName === 'local' && change) {
      callback(parseSettings(change.newValue), parseSettings(change.oldValue));
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function sanitizeSubfolder(value: string) {
  return value
    .split(/[\\/]+/)
    .map((segment) => segment.replace(INVALID_PATH_CHARACTERS, '').replace(EDGE_DOTS_AND_SPACES, ''))
    .filter(Boolean)
    .join('/');
}

export function getDownloadPath(settings: Settings, filename: string) {
  const subfolder = settings.saveLocation === 'subfolder' ? sanitizeSubfolder(settings.subfolder) : '';
  return subfolder ? `${subfolder}/${filename}` : filename;
}

function parseSettings(value: unknown): Settings {
  const stored = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof Settings, unknown>>;
  const saveLocation = stored.saveLocation as SaveLocation;

  return {
    saveLocation: SAVE_LOCATIONS.includes(saveLocation) ? saveLocation : DEFAULT_SETTINGS.saveLocation,
    subfolder: typeof stored.subfolder === 'string' ? stored.subfolder : DEFAULT_SETTINGS.subfolder,
    microphone: typeof stored.microphone === 'boolean' ? stored.microphone : DEFAULT_SETTINGS.microphone,
  };
}
