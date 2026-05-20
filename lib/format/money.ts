/**
 * Money formatting — German locale (de-DE).
 *
 * Amounts are stored as signed integer cents (ADR-0001).
 * formatEUR(250000) → "2.500,00 EUR"
 *
 * We use Intl.NumberFormat with style "currency" and locale "de-DE".
 * The currency symbol is appended as the ISO code "EUR" (not "€") per the
 * spec example "2.500,00 EUR". German locale with currencyDisplay "code"
 * produces this format naturally.
 */

const formatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "code", // "EUR" not "€"
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format signed integer cents as a German-locale EUR string.
 *
 * @example
 * formatEUR(250000)  // "2.500,00 EUR"
 * formatEUR(-119000) // "-1.190,00 EUR"
 * formatEUR(0)       // "0,00 EUR"
 */
export function formatEUR(cents: number): string {
  return formatter.format(cents / 100);
}
