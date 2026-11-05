import test from "node:test";
import assert from "node:assert/strict";
import * as strategy from "../docs/workbench/strategy.mjs";
import {
  createWorkspace,
  serializeBackup,
  parseBackup,
} from "../docs/workbench/workspace.mjs";
function fixture() {
  const s = createWorkspace(false);
  s.goals = [{ id: "g", title: "Goal" }];
  s.projects = [
    {
      id: "p",
      title: "Project",
      goalIds: ["g"],
      parentRef: { collection: "goals", id: "g" },
    },
    {
      id: "child",
      title: "Child",
      goalIds: ["g"],
      parentRef: { collection: "projects", id: "p" },
      execution: "active",
      relations: [{ type: "depends", targetId: "p", confirmed: true }],
    },
  ];
  s.plans = [
    {
      id: "plan",
      title: "Stage",
      itemIds: ["p"],
      parentRef: { collection: "projects", id: "p" },
      execution: "paused",
    },
  ];
  s.archives = [
    {
      id: "a",
      title: "History",
      projectId: "p",
      goalIds: ["g"],
      parentRef: { collection: "plans", id: "plan" },
      answer: "Original answer",
    },
  ];
  s.tasks = [
    { id: "t", title: "Task", goalIds: ["g"], itemIds: ["p"], done: true },
  ];
  s.notes = [{ id: "n", body: "Memo", itemIds: ["p"] }];
  return strategy.normalizeState(s);
}
test("deleting a goal preserves descendants, completion and records while detaching its links", () => {
  const s = fixture();
  assert.equal(typeof strategy.removeRecord, "function");
  strategy.removeRecord(s, "goals", "g");
  const restored = parseBackup(serializeBackup(s));
  assert.equal(restored.goals.length, 0);
  assert.equal(restored.projects.length, 2);
  assert.equal(restored.archives[0].answer, "Original answer");
  assert.equal(restored.tasks[0].done, true);
  assert.equal(restored.projects[0].parentRef, null);
  assert.deepEqual(restored.archives[0].goalIds, []);
});
test("deleting linked projects and plans preserves children and removes all active dangling references", () => {
  const s = fixture();
  assert.equal(typeof strategy.removeRecord, "function");
  strategy.removeRecord(s, "projects", "p");
  strategy.removeRecord(s, "plans", "plan");
  const restored = parseBackup(serializeBackup(s));
  assert.equal(restored.projects[0].id, "child");
  assert.equal(restored.projects[0].execution, "active");
  assert.deepEqual(restored.projects[0].relations, []);
  assert.equal(restored.archives[0].projectId, "");
  assert.equal(restored.archives[0].parentRef, null);
  assert.deepEqual(restored.notes[0].itemIds, []);
  assert.equal(restored.tasks[0].done, true);
});
test("deleting one archive keeps other records and rejects unknown targets without mutation", () => {
  const s = fixture();
  assert.equal(typeof strategy.removeRecord, "function");
  strategy.removeRecord(s, "archives", "a");
  assert.equal(strategy.normalizeState(s).archives.length, 0);
  assert.equal(s.projects.length, 2);
  const before = structuredClone(s);
  assert.throws(() => strategy.removeRecord(s, "goals", "missing"));
  assert.throws(() => strategy.removeRecord(s, "sources", "missing"));
  assert.deepEqual(s, before);
});
