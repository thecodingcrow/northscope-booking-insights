/**
 * Date formatting — German locale (de-DE), numeric.
 *
 * formatDate("2026-03-15") → "15.03.2026"
 *
 * We parse the ISO date string and format with German day-month-year order.
 * Using Intl.DateTimeFormat avoids timezone pitfalls by treating the ISO
 * date as UTC (we split manually to avoid the Date constructor's TZ shift).
 */

/**
 * Format an ISO date string as a German numeric date.
 *
 * @example
 * formatDate("2026-03-15") // "15.03.2026"
 * formatDate("2026-04-01") // "01.04.2026"
 */
export function formatDate(iso: string): string {
  // Split manually to avoid Date("YYYY-MM-DD") being parsed as UTC midnight
  // then shifted by the local timezone.
  const [year, month, day] = iso.split("-");
  // Zero-pad is preserved from the split; format with leading zeros.
  return `${day}.${month}.${year}`;
}
