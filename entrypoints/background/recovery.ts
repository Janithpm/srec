import { deleteRecordingBackup, listRecordingBackups } from '@/utils/recording-backup';
import { sendOffscreenCommand } from '@/utils/messages';
import { downloadRecording } from './download';
import { closeOffscreenDocument, ensureOffscreenDocument } from './offscreen-document';
import { ensureStatusLoaded, isRecording } from './status-store';

export async function recoverInterruptedRecordings() {
  await ensureStatusLoaded();

  if (isRecording() || (await listRecordingBackups()).length === 0) {
    return;
  }

  await ensureOffscreenDocument();

  try {
    const { recordings = [] } = await sendOffscreenCommand({ type: 'RECOVER_RECORDINGS' });

    for (const recording of recordings) {
      await downloadRecording(recording.blobUrl, recording.filename);
      await deleteRecordingBackup(recording.backupId);
    }
  } finally {
    // A recording may have started while recovering; it needs the offscreen document.
    if (!isRecording()) {
      await closeOffscreenDocument();
    }
  }
}
