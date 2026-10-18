export function getErrorMessage(error: unknown, fallback = 'Recording failed. Please try again.') {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}
