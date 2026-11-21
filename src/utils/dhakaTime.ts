// Date-only filters ("2026-11-21") mean a calendar day in Bangladesh (UTC+6), not in the
// server's timezone. Full ISO timestamps are used as given.
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export const dhakaDayStart = (value: string): Date =>
  isYmd(value) ? new Date(`${value}T00:00:00.000+06:00`) : new Date(value);

export const dhakaDayEnd = (value: string): Date =>
  isYmd(value) ? new Date(`${value}T23:59:59.999+06:00`) : new Date(value);
