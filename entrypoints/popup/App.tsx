import { useEffect, useRef, useState, type TransitionEvent } from 'react';
import { RecorderView } from './RecorderView';
import { SettingsView } from './SettingsView';
import { useSettings } from './useSettings';
import { useShortcuts } from './useShortcuts';
import './App.css';

type View = 'recorder' | 'settings';

function App() {
  const [view, setView] = useState<View>('recorder');
  const [isSliding, setIsSliding] = useState(false);
  const { settings, updateSettings } = useSettings();
  const shortcuts = useShortcuts();
  const trackRef = useRef<HTMLDivElement>(null);
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (!hasNavigated.current) {
      return;
    }

    trackRef.current
      ?.querySelector<HTMLElement>(`[data-panel="${view}"] [data-autofocus]`)
      ?.focus({ preventScroll: true });
  }, [view]);

  function showView(nextView: View) {
    if (nextView === view) {
      return;
    }

    hasNavigated.current = true;
    setView(nextView);
    setIsSliding(true);
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && event.propertyName === 'transform') {
      setIsSliding(false);
    }
  }

  function panelProps(panel: View) {
    const isActive = panel === view;

    return {
      className: `panel${!isActive && !isSliding ? ' panel--collapsed' : ''}`,
      'data-panel': panel,
      inert: !isActive,
    };
  }

  return (
    <div className="popup">
      <div
        ref={trackRef}
        className={`popup__track popup__track--${view}`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div {...panelProps('recorder')}>
          <RecorderView
            settings={settings}
            shortcuts={shortcuts}
            onOpenSettings={() => showView('settings')}
          />
        </div>
        <div {...panelProps('settings')}>
          <SettingsView
            settings={settings}
            shortcuts={shortcuts}
            onUpdate={updateSettings}
            onBack={() => showView('recorder')}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
