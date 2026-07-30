const queues = new Map<string, Promise<void>>();
const nextRequestAt = new Map<string, number>();

export async function schedule<T>(
  sourceId: string,
  intervalMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  if (!queues.has(sourceId)) {
    queues.set(sourceId, Promise.resolve());
    nextRequestAt.set(sourceId, 0);
  }

  const queue = queues.get(sourceId)!;

  const scheduled = queue.then(async () => {
    const waitMs = Math.max(0, (nextRequestAt.get(sourceId) ?? 0) - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRequestAt.set(sourceId, Date.now() + intervalMs);
    return operation();
  });

  queues.set(
    sourceId,
    scheduled.then(
      () => undefined,
      () => undefined,
    ),
  );

  return scheduled;
}

export function resetScheduler(): void {
  queues.clear();
  nextRequestAt.clear();
}
