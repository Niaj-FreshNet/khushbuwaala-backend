// Reading anything a `catch` receives without `any`.

/** The message of an Error, a thrown string, or anything else */
export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

/** HTTP status and body of a failed axios call (courier / payment gateway), when there is one */
export const httpErrorOf = (err: unknown): { status?: number; data?: unknown; message?: string } => {
  const res = err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { status?: unknown; data?: unknown } }).response
    : undefined;
  const data = res?.data;
  const message = data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string'
    ? (data as { message: string }).message
    : undefined;
  return { status: typeof res?.status === 'number' ? res.status : undefined, data, message };
};
