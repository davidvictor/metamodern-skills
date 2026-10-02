/*
 * The values a comparison shows, side by side. Pure data in, data out, so the selectors,
 * the previews and a saved comparison always agree on the same ordered tuple.
 */

export type ComparisonCount = 2 | 3 | 4
export const comparisonCount = (n: number) => Math.max(2, Math.min(4, n)) as ComparisonCount

/**
 * A saved comparison as stored state: at most four values, the count clamped to two to four,
 * and a one-value tuple completed with the fallback B so `values` matches `count`.
 */
export function savedComparison(saved: { values?: string[]; a?: string; b?: string }, fallbackA: string, fallbackB: string) {
  const values = (saved.values?.length ? saved.values : [saved.a ?? fallbackA, saved.b ?? fallbackB]).slice(0, 4)
  if (values.length === 1) values.push(values[0] === fallbackB ? fallbackA : fallbackB)
  return { a: values[0], b: values[1], values, count: comparisonCount(values.length) }
}

/**
 * The resolved sides. A and B fall back to valid options (or the fixed pair a fallback axis
 * uses); every other side follows them, so `compared[0]` and `compared[1]` are always A and B.
 * `count` is the requested count capped at the options the axis has (never below two), so a
 * 4-up choice on a three-value axis shows three sides and waits for three. With fewer than two
 * distinct valid values the comparison is not `available`.
 */
export function resolveComparison(options: string[], saved: string[], count: number, pair?: [string, string]) {
  const valid = (id: string) => options.includes(id)
  const a = pair ? pair[0] : valid(saved[0]) ? saved[0] : (options[0] ?? "")
  const b = pair ? pair[1] : valid(saved[1]) && saved[1] !== a ? saved[1] : (options.find((o) => o !== a) ?? "")
  const n = comparisonCount(Math.min(comparisonCount(count), options.length))
  const compared = [a, b]
  for (const id of pair ? [] : saved.slice(2)) if (compared.length < n && valid(id) && !compared.includes(id)) compared.push(id)
  while (compared.length < n) {
    const next = options.find((o) => !compared.includes(o))
    if (next === undefined) break
    compared.push(next)
  }
  return { a, b, compared, count: n, available: a !== b && valid(a) && valid(b) }
}

/** Put a value on one side. A value another side already shows trades places with it, so no two sides repeat. */
export function chooseCompared(compared: string[], index: number, value: string) {
  const values = [...compared]
  const other = values.indexOf(value)
  if (other >= 0 && other !== index) values[other] = values[index]
  values[index] = value
  return values
}
