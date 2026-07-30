export interface TransportMetrics {
  requests: number;
  retries: number;
  blocks: number;
  timeouts: number;
  errors: number;
}

const allMetrics = new Map<string, TransportMetrics>();

export function updateTransportMetrics(
  sourceId: string,
  metrics: TransportMetrics,
): void {
  allMetrics.set(sourceId, metrics);
}

export function getTransportMetrics(): Record<string, TransportMetrics> {
  const result: Record<string, TransportMetrics> = {};
  for (const [key, value] of allMetrics) {
    result[key] = { ...value };
  }
  return result;
}

export function logTransportSummary(): void {
  const all = getTransportMetrics();
  for (const [sourceId, m] of Object.entries(all)) {
    console.info(
      `[${sourceId}] transport: ${m.requests} req, ${m.retries} retry, ${m.blocks} block, ${m.timeouts} timeout, ${m.errors} err`,
    );
  }
}
