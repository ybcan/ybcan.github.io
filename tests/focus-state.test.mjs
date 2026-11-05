import test from "node:test";
import assert from "node:assert/strict";
import { saveFocus, loadFocus } from "../docs/workbench/focus-state.mjs";
import { FocusClock } from "../docs/workbench/workspace.mjs";
const storage = () => {
  let raw = null;
  return {
    getItem: () => raw,
    setItem: (k, v) => {
      raw = v;
    },
  };
};
test("running focus uses its original deadline after reload, paused focus retains remaining time", () => {
  const s = storage(),
    clock = new FocusClock(60);
  clock.start(1000);
  saveFocus(s, clock);
  const restored = loadFocus(s, 11000);
  assert.deepEqual(restored.read(11000), {
    remainingSeconds: 50,
    running: true,
  });
  restored.pause(16000);
  saveFocus(s, restored);
  const paused = loadFocus(s, 40000);
  assert.deepEqual(paused.read(40000), {
    remainingSeconds: 45,
    running: false,
  });
});
test("expired focus stays stopped and malformed snapshots recover default duration", () => {
  const s = storage(),
    clock = new FocusClock(60);
  clock.start(0);
  saveFocus(s, clock);
  assert.deepEqual(loadFocus(s, 61000).read(61000), {
    remainingSeconds: 0,
    running: false,
  });
  s.setItem("x", "{broken");
  assert.equal(loadFocus(s).read().remainingSeconds, 1500);
  s.setItem(
    "x",
    JSON.stringify({ duration: -2, remaining: 0, deadline: null }),
  );
  assert.equal(loadFocus(s).read().remainingSeconds, 1500);
});
