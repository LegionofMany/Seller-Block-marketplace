export type GasBufferOptions = {
  bufferBps?: number; // default 2000 (= +20%)
  minGasLimit?: bigint; // optional floor
};

export function applyGasBuffer(estimated: bigint, opts: GasBufferOptions = {}): bigint {
  const bufferBps = opts.bufferBps ?? 2000;
  const buffered = estimated + (estimated * BigInt(bufferBps)) / 10_000n;
  if (opts.minGasLimit !== undefined && buffered < opts.minGasLimit) return opts.minGasLimit;
  return buffered;
}
