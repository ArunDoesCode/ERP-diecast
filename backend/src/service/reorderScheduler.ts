import { istDayKey, istDayStartInstant } from "../lib/ist-day";
import { reorderRepository } from "../repository/reorderRepository";
import { reorderRunService } from "./reorderRunService";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

/**
 * One timer tick (BR-RO-10). Starts at most one scheduled run per IST day:
 * switch on, the run hour has passed, the schedule was not changed after
 * today's run time, and no scheduled run exists for today. A start refused
 * as busy saves nothing and is retried by the next tick.
 */
export async function tick(now: Date = new Date()): Promise<void> {
  const settings = await reorderRepository.getSettings();
  if (!settings?.enabled) return;

  const due = new Date(
    istDayStartInstant(now).getTime() + settings.runHour * 3_600_000,
  );
  if (now < due) return;
  if (settings.scheduleChangedAt >= due) return;
  if (await reorderRepository.hasScheduledRunOn(istDayKey(now))) return;

  await reorderRunService.start({ trigger: "schedule", startedBy: null }, now);
}

/** Starts the in-process daily timer; call from index.ts only. Returns a stop function. */
export function startReorderScheduler(): () => void {
  let ticking = false;
  const run = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await tick();
    } catch (error) {
      console.error("Reorder scheduler tick failed", error);
    } finally {
      ticking = false;
    }
  };
  const first = setTimeout(run, FIRST_TICK_MS);
  const timer = setInterval(run, TICK_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
