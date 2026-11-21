export const USAGE_TICK = 60_000;
export const IDLE_CUTOFF_SECONDS = 5 * 60;
const LONGEST_STEP = 2 * USAGE_TICK;

export function usageStep(input: {
  elapsed: number;
  idleSeconds: number;
  focused: boolean;
}): number {
  if (!input.focused || !(input.idleSeconds < IDLE_CUTOFF_SECONDS) || !(input.elapsed > 0))
    return 0;
  return Math.min(input.elapsed, LONGEST_STEP);
}

export interface UsageMeterDeps {
  monotonic: () => number;
  focused: () => boolean;
  idleSeconds: () => number;
  record: (ms: number) => void;
}

export function startUsageMeter(deps: UsageMeterDeps, every = USAGE_TICK): () => void {
  let last = deps.monotonic();
  const timer = setInterval(() => {
    const at = deps.monotonic();
    const ms = usageStep({
      elapsed: at - last,
      idleSeconds: deps.idleSeconds(),
      focused: deps.focused(),
    });
    last = at;
    if (ms > 0) deps.record(ms);
  }, every);
  timer.unref();
  return () => clearInterval(timer);
}
