import type { RecoveredRecording } from '@/utils/messages';
import {
  deleteRecordingBackup,
  getRecordingBackupChunks,
  listRecordingBackups,
} from '@/utils/recording-backup';
import { createRecordingFilename } from './recording-format';
import { getActiveBackupId } from './tab-recorder';

export async function recoverRecordings() {
  const recovered: RecoveredRecording[] = [];
  const activeBackupId = getActiveBackupId();

  for (const backup of await listRecordingBackups()) {
    if (backup.id === activeBackupId) {
      continue;
    }

    const chunks = await getRecordingBackupChunks(backup.id);
    if (chunks.length === 0) {
      await deleteRecordingBackup(backup.id);
      continue;
    }

    const blob = new Blob(chunks, { type: backup.mimeType });
    recovered.push({
      blobUrl: URL.createObjectURL(blob),
      filename: createRecordingFilename(backup.startedAt, backup.mimeType, '-recovered'),
      backupId: backup.id,
    });
  }

  return recovered;
}
