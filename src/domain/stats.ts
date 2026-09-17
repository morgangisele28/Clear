/**
 * The only statistics in Clear, and a note on why there are no more.
 *
 * Diary data from one person goes wrong in two ways that a correlation
 * coefficient cannot see:
 *
 *   1. Direction. Airway care slips because you are ill. Correlating the two
 *      over the same days reads that backwards, as less care having made you ill.
 *   2. Multiplicity. There are around twenty series here, so 190 pairings. At the
 *      usual threshold roughly ten of them look real in a log that contains
 *      nothing real at all. Diary days are also autocorrelated, so the effective
 *      sample is far smaller than the day count, which inflates it further.
 *
 * So there are no coefficients, no p-values and nothing that scans pairs looking
 * for a hit: contrasts of extremes, medians with the n printed next to them, and
 * charts that put the series side by side and leave the reading to the person.
 */

/**
 * The middle value. An even-length set is averaged and rounded, because every
 * median in this app is a count of days and half a day is not a thing.
 */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function mean(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
