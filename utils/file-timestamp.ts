export function formatFileTimestamp(time: number) {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, '').replace('T', '-').replaceAll(':', '-');
}
