import { formatFileTimestamp } from './file-timestamp';
import { formatLogEntry, readLogEntries } from './logger';
import { getDownloadPath, getSettings } from './settings';

export async function exportLogs() {
  const [entries, platform, settings] = await Promise.all([
    readLogEntries(),
    chrome.runtime.getPlatformInfo(),
    getSettings(),
  ]);

  const { name, version } = chrome.runtime.getManifest();
  const lines = [
    `${name} ${version} logs`,
    `Exported: ${new Date().toISOString()}`,
    `Platform: ${platform.os} ${platform.arch}`,
    `Browser: ${navigator.userAgent}`,
    '',
    ...(entries.length > 0 ? entries.map(formatLogEntry) : ['No log entries.']),
    '',
  ];

  await chrome.downloads.download({
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`,
    filename: getDownloadPath(settings, createLogFilename()),
    saveAs: settings.saveLocation === 'ask',
  });
}

function createLogFilename() {
  return `srec-logs-${formatFileTimestamp(Date.now())}.txt`;
}
