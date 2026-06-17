export function parseQuitDate(quitDate: string): Date {
  // Date-only strings (no time) must be parsed as local midnight, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(quitDate)) {
    const [y, mo, d] = quitDate.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date(quitDate);
}
