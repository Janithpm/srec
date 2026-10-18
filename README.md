<p align="center">
  <img src="public/icon/icon128.png" width="96" height="96" alt="SREC icon">
</p>

<h1 align="center">SREC</h1>

<p align="center">
  A minimal Chrome extension that records the current tab, with its sound, and saves it as an MP4.
</p>

<p align="center">
  <a href="https://github.com/Janithpm/srec/releases/latest"><img src="https://img.shields.io/github/v/release/Janithpm/srec?label=release" alt="Latest release"></a>
  <a href="https://github.com/Janithpm/srec/actions/workflows/release.yml"><img src="https://github.com/Janithpm/srec/actions/workflows/release.yml/badge.svg" alt="Release workflow"></a>
</p>

---

## Features

- **One-click tab recording** with the tab's own audio. You keep hearing the tab while it records.
- **Microphone overlay.** Mix your mic into the recording to narrate a demo or capture your side of a call.
- **MP4 output** (H.264 + AAC), with a WebM fallback on browsers that can't record MP4.
- **Keyboard shortcuts** to start and stop recording or toggle the mic without opening the popup.
- **Choose where files go:** your Downloads folder, a subfolder inside Downloads, or ask every time.
- **Crash-safe.** Recordings are backed up to local storage as they're made. If Chrome or the extension stops unexpectedly, the recording is saved the next time the extension starts.
- **Private by design.** Nothing leaves your computer. No accounts, no analytics, no servers.

## Requirements

- Google Chrome 116 or newer, or another Chromium browser such as Edge, Brave or Arc.

## Installation

SREC isn't on the Chrome Web Store. You install it from the zip file in each [GitHub release](https://github.com/Janithpm/srec/releases/latest).

### 1. Download and extract

**macOS / Linux**

```sh
curl -fsSL -o /tmp/srec.zip https://github.com/Janithpm/srec/releases/latest/download/srec-chrome.zip \
  && rm -rf ~/srec && mkdir -p ~/srec && unzip -q /tmp/srec.zip -d ~/srec && rm /tmp/srec.zip
```

**Windows (PowerShell)**

```powershell
Invoke-WebRequest https://github.com/Janithpm/srec/releases/latest/download/srec-chrome.zip -OutFile "$env:TEMP\srec.zip"
Remove-Item "$HOME\srec" -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive "$env:TEMP\srec.zip" -DestinationPath "$HOME\srec"
Remove-Item "$env:TEMP\srec.zip"
```

**Manually:** download `srec-chrome.zip` from the [latest release](https://github.com/Janithpm/srec/releases/latest) and extract it into a folder you'll keep, for example `~/srec`.

### 2. Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right corner).
3. Click **Load unpacked** and select the `srec` folder.
4. Pin SREC from the puzzle-piece menu so it's always in the toolbar.

> Keep the folder where it is. Chrome loads the extension from that folder, so deleting or moving it removes the extension.

### Updating

Run the same download command again, then click the reload icon on the SREC card in `chrome://extensions`. Keep the same folder path so your settings and shortcuts stay as they are.

## Usage

1. Go to the tab you want to record.
2. Click the SREC icon and press **Record**. A red **REC** badge appears on the icon.
3. Press **Stop** (or use the shortcut) when you're done. The video is saved automatically.

### Microphone

Click the mic button in the popup to include your microphone. The first time, SREC opens a small page where Chrome asks for permission. After that, the mic can be switched on or off at any time, even in the middle of a recording. The badge briefly shows **MIC** or **OFF** to confirm.

> The mic is recorded directly from your device, so it is still captured when you're muted in a meeting app.

### Keyboard shortcuts

| Action                    | Default         |
| ------------------------- | --------------- |
| Start or stop recording   | `Alt+Shift+R`   |
| Turn microphone on or off | `Alt+Shift+M`   |

Change them at `chrome://extensions/shortcuts`, or from **Settings → Shortcuts** in the popup.

### Settings

Open the gear icon in the popup to choose where recordings are saved:

- **Downloads**: straight into your Downloads folder.
- **Folder in Downloads**: into a subfolder (default `SREC`).
- **Ask every time**: shows a Save As dialog for each recording.

Files are named `tab-recording-YYYY-MM-DD-HH-MM-SS.mp4`.

### Good to know

- Recording stops if you close the tab being recorded, and the video is saved. While recording, Chrome warns you before you close the tab or leave the page.
- Chrome only lets one extension capture a tab at a time.
- Some pages can't be captured, such as `chrome://` pages and the Chrome Web Store.

## Permissions

| Permission         | Why                                                        |
| ------------------ | ---------------------------------------------------------- |
| `tabCapture`       | Capture the current tab's video and audio.                 |
| `activeTab`        | Access the tab you started recording from.                 |
| `offscreen`        | Run the recorder in the background while you browse.       |
| `downloads`        | Save the finished video to disk.                           |
| `storage`          | Remember your settings.                                    |
| `unlimitedStorage` | Back up long recordings locally until they're saved.       |
| `scripting`        | Warn you before closing the tab that's being recorded.     |
