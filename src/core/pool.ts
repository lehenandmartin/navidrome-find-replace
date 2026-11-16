/**
 * Map over items with at most `limit` calls in flight. Results keep the input order.
 * Each item settles independently: one failure doesn't stop the others.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  let done = 0
  onProgress?.(0, items.length)
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
      onProgress?.(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}
