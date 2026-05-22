import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SREC',
    description: 'Record the active browser tab with sound and save it as a WebM file.',
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'tabCapture', 'offscreen', 'downloads', 'storage'],
  },
});
