// @ts-check
import { FocusClock } from "#workbench/workspace";
const KEY = "personal-cockpit.focus.v1";
/** @param {Pick<Storage,'getItem'>} storage @param {number} now */
export function loadFocus(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || "null");
    if (!value) return new FocusClock();
    const clock = new FocusClock(value.duration);
    if (
      !Number.isFinite(value.remaining) ||
      value.remaining < 0 ||
      value.remaining > value.duration * 1000 ||
      (value.deadline !== null && !Number.isFinite(value.deadline))
    )
      throw Error("invalid clock");
    clock.remaining = value.remaining;
    clock.deadline = value.deadline;
    clock.read(now);
    return clock;
  } catch {
    return new FocusClock();
  }
}
/** @param {Pick<Storage,'setItem'>} storage @param {FocusClock} clock */
export function saveFocus(storage, clock) {
  try {
    storage.setItem(
      KEY,
      JSON.stringify({
        duration: clock.duration,
        remaining: clock.remaining,
        deadline: clock.deadline,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
