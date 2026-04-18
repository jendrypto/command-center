/**
 * Return error details for API responses only in non-production.
 * Keeps stack traces / SQLite error messages out of responses when deployed.
 */
export function devDetails(error: unknown): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : undefined
}
