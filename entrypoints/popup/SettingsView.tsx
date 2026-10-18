import { Fragment } from 'react';
import { SHORTCUTS_SETTINGS_URL } from '@/utils/commands';
import { DEFAULT_SETTINGS, sanitizeSubfolder, type SaveLocation, type Settings } from '@/utils/settings';
import { CheckIcon, ChevronLeftIcon } from './icons';
import { splitShortcut, type Shortcuts } from './useShortcuts';

type SettingsViewProps = {
  settings: Settings | null;
  shortcuts: Shortcuts | null;
  onUpdate: (changes: Partial<Settings>) => void;
  onBack: () => void;
};

const SAVE_LOCATION_OPTIONS: { value: SaveLocation; label: string }[] = [
  { value: 'downloads', label: 'Downloads' },
  { value: 'subfolder', label: 'Folder in Downloads' },
  { value: 'ask', label: 'Ask every time' },
];

const SHORTCUT_ROWS: { name: keyof Shortcuts; label: string }[] = [
  { name: 'toggleRecording', label: 'Record' },
  { name: 'toggleMicrophone', label: 'Microphone' },
];

export function SettingsView({ settings, shortcuts, onUpdate, onBack }: SettingsViewProps) {
  return (
    <div className="settings">
      <header className="settings__header">
        <button
          className="icon-button"
          type="button"
          aria-label="Back"
          title="Back"
          onClick={onBack}
          data-autofocus
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="settings__title">Settings</h2>
      </header>

      {settings && <SaveLocationSettings settings={settings} onUpdate={onUpdate} />}
      {shortcuts && <ShortcutSettings shortcuts={shortcuts} />}
    </div>
  );
}

type SaveLocationSettingsProps = {
  settings: Settings;
  onUpdate: SettingsViewProps['onUpdate'];
};

function SaveLocationSettings({ settings, onUpdate }: SaveLocationSettingsProps) {
  return (
    <fieldset className="section">
      <legend className="section__title">Save to</legend>

      <div className="list">
        {SAVE_LOCATION_OPTIONS.map((option) => {
          const isSelected = settings.saveLocation === option.value;

          return (
            <Fragment key={option.value}>
              <label className={`list__row option${isSelected ? ' option--selected' : ''}`}>
                <input
                  className="option__input"
                  type="radio"
                  name="save-location"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onUpdate({ saveLocation: option.value })}
                />
                {option.label}
                <span className="option__check">
                  <CheckIcon />
                </span>
              </label>

              {option.value === 'subfolder' && isSelected && (
                <div className="list__row folder-field">
                  <span className="folder-field__prefix">Downloads/</span>
                  <input
                    className="folder-field__input"
                    type="text"
                    aria-label="Folder name"
                    value={settings.subfolder}
                    placeholder={DEFAULT_SETTINGS.subfolder}
                    maxLength={100}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => onUpdate({ subfolder: event.target.value })}
                    onBlur={(event) =>
                      onUpdate({ subfolder: sanitizeSubfolder(event.target.value) || DEFAULT_SETTINGS.subfolder })
                    }
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </fieldset>
  );
}

function ShortcutSettings({ shortcuts }: { shortcuts: Shortcuts }) {
  return (
    <section className="section" aria-labelledby="shortcuts-title">
      <div className="section__header">
        <h3 id="shortcuts-title" className="section__title">
          Shortcuts
        </h3>
        <button
          className="text-button"
          type="button"
          onClick={() => chrome.tabs.create({ url: SHORTCUTS_SETTINGS_URL })}
        >
          Edit
        </button>
      </div>

      <div className="list">
        {SHORTCUT_ROWS.map(({ name, label }) => {
          const shortcut = shortcuts[name];

          return (
            <div key={name} className="list__row">
              {label}
              {shortcut ? (
                <span className="shortcut__keys" aria-label={shortcut}>
                  {splitShortcut(shortcut).map((key) => (
                    <kbd key={key} className="key">
                      {key}
                    </kbd>
                  ))}
                </span>
              ) : (
                <span className="shortcut__unset">Not set</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
