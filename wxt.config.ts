import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SREC',
    description: 'Record the active browser tab with sound and save it as a WebM file.',
    minimum_chrome_version: '116',
    icons: {
      16: 'icon/icon16.png',
      32: 'icon/icon32.png',
      48: 'icon/icon48.png',
      128: 'icon/icon128.png',
    },
    action: {
      default_icon: {
        16: 'icon/icon16.png',
        32: 'icon/icon32.png',
        48: 'icon/icon48.png',
        128: 'icon/icon128.png',
      },
    },
    permissions: ['activeTab', 'tabCapture', 'offscreen', 'downloads', 'storage'],
  },
});
