import { useEffect, useState } from 'react';

export function useMicrophonePermission() {
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setPermission(status.state);

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        status = result;
        update();
        status.addEventListener('change', update);
      })
      .catch(() => setPermission('prompt'));

    return () => status?.removeEventListener('change', update);
  }, []);

  return permission;
}
