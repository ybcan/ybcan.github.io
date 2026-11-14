import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  serializeBackup,
  parseBackup,
} from "../docs/workbench/workspace.mjs";
import {
  normalizeState,
  prepareUpdate,
  applyUpdate,
  removeRecord,
} from "../docs/workbench/strategy.mjs";
function old() {
  const s = createWorkspace(false);
  s.goals = [{ id: "g", title: "Goal" }];
  s.projects = [
    {
      id: "p",
      title: "Project",
      goalIds: ["g"],
      steps: [
        { id: "s", title: "Completed action", done: true },
        { id: "s2", title: "Next action", done: false },
      ],
    },
  ];
  s.plans = [
    {
      id: "roadmap",
      title: "AI roadmap",
      origin: "ai",
      itemIds: ["p"],
      summary: "Original proposal",
      adoption: "candidate",
    },
    {
      id: "action",
      title: "Explicit action",
      kind: "task",
      itemIds: ["p"],
      status: "done",
      origin: "user",
    },
  ];
  return s;
}
test("legacy project steps and action plans become canonical tasks while route proposals remain materials", () => {
  const s = normalizeState(old());
  assert.equal(s.projects[0].steps.length, 0);
  assert.equal(s.tasks.length, 3);
  assert.equal(s.tasks.find((t) => t.title === "Completed action").done, true);
  assert.equal(s.tasks.find((t) => t.title === "Explicit action").done, true);
  assert.ok(s.tasks.every((t) => t.projectId === "p"));
  assert.equal(s.plans[0].materialType, "proposal");
  assert.equal(s.plans[0].summary, "Original proposal");
  assert.equal(s.plans[0].adoption, "candidate");
  assert.equal(s.workModel.version, 1);
});
test("migration is idempotent and retains a deleted migrated task as deleted", () => {
  let s = normalizeState(old());
  const count = s.tasks.length;
  assert.deepEqual(normalizeState(s), s);
  const t = s.tasks.find((t) => t.title === "Next action");
  removeRecord(s, "tasks", t.id);
  s.projects[0].steps = [{ id: "s2", title: "Next action", done: false }];
  s = normalizeState(s);
  assert.equal(s.tasks.length, count - 1);
  assert.ok(!s.tasks.some((x) => x.id === t.id));
});
test("new backup version round-trips canonical tasks and older backups migrate without mutating input", () => {
  const input = old(),
    before = structuredClone(input);
  const s = parseBackup(
    JSON.stringify({ format: "personal-cockpit", version: 2, data: input }),
  );
  assert.deepEqual(input, before);
  const raw = serializeBackup(s);
  assert.equal(JSON.parse(raw).version, 3);
  assert.deepEqual(parseBackup(raw), s);
});
test("task primary project is validated and remapped when importing an old alias", async () => {
  const s = normalizeState(old());
  const packet = {
    format: "strategy-workbench-update",
    version: 1,
    batchId: "alias-task",
    records: {
      projects: [{ id: "remote", title: "Source project" }],
      tasks: [
        {
          id: "new-task",
          title: "Imported action",
          projectId: "remote",
          origin: "ai",
        },
      ],
    },
  };
  const n = applyUpdate(
    s,
    await prepareUpdate(s, packet, { aliases: { "projects:remote": "p" } }),
  );
  assert.equal(n.tasks.find((t) => t.id === "new-task").projectId, "p");
  assert.equal(n.tasks.find((t) => t.id === "new-task").adoption, "candidate");
  n.tasks[0].projectId = "missing";
  assert.throws(() => normalizeState(n));
});
test("a stale task action cannot complete a suggestion that was unadopted in another tab", async () => {
  const { completeTask } = await import("../docs/workbench/work-model.mjs");
  const s = normalizeState(old());
  const t = s.tasks.find((t) => !t.done);
  const previous = structuredClone(t);
  t.adoption = "candidate";
  assert.throws(() => completeTask(s, t.id, true, previous), /变化|采纳/);
  assert.equal(t.done, false);
});
test("clearing examples retains a primary project needed by a personal task", async () => {
  const { clearExamples } = await import("../docs/workbench/strategy.mjs");
  const s = createWorkspace();
  s.tasks.push({
    id: "personal",
    title: "Keep context",
    projectId: s.projects[0].id,
    itemIds: [],
    demo: false,
  });
  const cleaned = clearExamples(s);
  assert.ok(cleaned.tasks.some((t) => t.id === "personal"));
  assert.ok(cleaned.projects.some((p) => p.id === s.projects[0].id));
});
test("distinct same-title steps and action plans never collapse into an unrelated task", () => {
  const s = old();
  s.projects[0].steps = [
    { id: "one", title: "Same action", done: false },
    { id: "two", title: "Same action", done: false },
  ];
  s.tasks = [
    {
      id: "independent",
      title: "Same action",
      projectId: "p",
      done: false,
      adoption: "adopted",
      body: "Independent context",
    },
  ];
  s.plans = [
    {
      id: "action-source",
      title: "Same action",
      materialType: "action",
      itemIds: ["p"],
      origin: "user",
      summary: "Source plan context",
      dueDate: "2026-12-01",
    },
  ];
  const n = normalizeState(s);
  assert.equal(n.tasks.length, 4);
  assert.equal(
    n.tasks.find((t) => t.id === "independent").body,
    "Independent context",
  );
  assert.ok(n.tasks.some((t) => t.sourceStepId === "one"));
  assert.ok(n.tasks.some((t) => t.sourceStepId === "two"));
  assert.equal(
    n.tasks.find(
      (t) => t.migrationKey === JSON.stringify(["plan", "action-source"]),
    ).dueDate,
    "2026-12-01",
  );
  assert.deepEqual(normalizeState(n), n);
});
test("action material migration respects explicit primary ownership instead of the first secondary link", () => {
  const s = old();
  s.projects.push({
    id: "p2",
    title: "Second project",
    goalIds: ["g"],
    steps: [],
  });
  s.plans = [
    {
      id: "owned-action",
      title: "Owned action",
      materialType: "action",
      parentRef: { collection: "projects", id: "p2" },
      itemIds: ["p", "p2"],
    },
  ];
  const n = normalizeState(s);
  assert.equal(n.tasks.find((t) => t.title === "Owned action").projectId, "p2");
  assert.deepEqual(n.tasks.find((t) => t.title === "Owned action").itemIds, [
    "p",
    "p2",
  ]);
});
test("an explicitly unassigned task keeps secondary links without promoting them to ownership", async () => {
  const { parentOf, buildHierarchy } = await import(
    "../docs/workbench/hierarchy.mjs"
  );
  const s = old();
  s.tasks = [
    {
      id: "loose",
      title: "Unassigned",
      projectId: "",
      itemIds: ["p"],
      goalIds: [],
    },
  ];
  const n = normalizeState(s),
    t = n.tasks.find((t) => t.id === "loose");
  assert.equal(t.projectId, "");
  assert.equal(parentOf("tasks", t), null);
  const root = buildHierarchy(n).find((n) => n.key === "group:unassigned");
  assert.ok(root.children.some((n) => n.key === "tasks:loose"));
});
test("migration refuses an overflowing provenance index before returning an unusable workspace", () => {
  const s = old();
  s.workModel = {
    version: 1,
    links: Object.fromEntries(
      Array.from({ length: 30000 }, (_, i) => ["retired-" + i, "deleted-" + i]),
    ),
  };
  assert.throws(() => normalizeState(s), /迁移.*超限|迁移.*30000/);
});
