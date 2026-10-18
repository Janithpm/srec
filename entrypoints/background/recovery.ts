import { sendToOffscreen, type RecoveredRecording } from '@/utils/messages';
import { deleteRecordingBackup, listRecordingBackups } from '@/utils/recording-backup';
import { downloadRecording } from './download';
import { holdOffscreenDocument, releaseOffscreenDocument } from './offscreen-document';
import { ensureStatusLoaded, isRecording } from './status-store';

const RECOVERY_HOLDER = 'recovery';

export async function recoverInterruptedRecordings() {
  await ensureStatusLoaded();

  if (isRecording() || (await listRecordingBackups()).length === 0) {
    return;
  }

  await holdOffscreenDocument(RECOVERY_HOLDER);

  try {
    const { recordings = [] } = await sendToOffscreen({ type: 'RECOVER_RECORDINGS' });

    for (const recording of recordings) {
      await saveRecoveredRecording(recording).catch(console.error);
    }
  } finally {
    await releaseOffscreenDocument(RECOVERY_HOLDER);
  }
}

async function saveRecoveredRecording({ blobUrl, filename, backupId }: RecoveredRecording) {
  await downloadRecording(blobUrl, filename, { allowSaveAs: false });
  await deleteRecordingBackup(backupId);
}
