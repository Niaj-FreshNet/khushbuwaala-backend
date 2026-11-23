/** True when `v` is one of a Prisma enum's values (query strings are unchecked text). */
export const isEnumValue = <E extends Record<string, string>>(e: E, v: unknown): v is E[keyof E] =>
  typeof v === 'string' && (Object.values(e) as string[]).includes(v);
