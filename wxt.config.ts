import { defineConfig } from 'wxt';
import { TOGGLE_MICROPHONE_COMMAND, TOGGLE_RECORDING_COMMAND } from './utils/commands';

const ICONS = {
  16: 'icon/icon16.png',
  32: 'icon/icon32.png',
  48: 'icon/icon48.png',
  128: 'icon/icon128.png',
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    artifactTemplate: '{{name}}-{{browser}}.zip',
  },
  manifest: {
    name: 'SREC',
    description: 'Record the active browser tab with sound and save it as an MP4 file.',
    minimum_chrome_version: '116',
    icons: ICONS,
    action: {
      default_icon: ICONS,
    },
    commands: {
      [TOGGLE_RECORDING_COMMAND]: {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Start or stop recording the current tab',
      },
      [TOGGLE_MICROPHONE_COMMAND]: {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Turn microphone recording on or off',
      },
    },
    permissions: [
      'activeTab',
      'tabCapture',
      'offscreen',
      'downloads',
      'storage',
      'scripting',
      'unlimitedStorage',
    ],
  },
});
