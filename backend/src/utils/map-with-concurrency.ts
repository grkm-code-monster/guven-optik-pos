/** Sınırlı eşzamanlılıkla async map — harici bağımlılık gerektirmez. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const cap = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= items.length) break
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()))
  return results
}
