import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../docs/workbench/workspace.mjs";
import {
  normalizeState,
  prepareUpdate,
  applyUpdate,
} from "../docs/workbench/strategy.mjs";
import { buildHierarchy, primaryGoalId } from "../docs/workbench/hierarchy.mjs";
const ref = (collection, id) => ({ collection, id });
function state() {
  const s = createWorkspace(false);
  s.goals = [
    { id: "g1", title: "Goal A", directionIds: ["ai"] },
    { id: "g2", title: "Goal B", directionIds: ["govern"] },
  ];
  s.projects = [
    {
      id: "p1",
      title: "Practice A",
      directionIds: ["ai"],
      goalIds: ["g1", "g2"],
      steps: [],
    },
    {
      id: "p2",
      title: "Subproject",
      directionIds: ["govern"],
      goalIds: ["g2"],
      parentRef: ref("projects", "p1"),
      steps: [],
    },
  ];
  s.plans = [
    {
      id: "plan1",
      title: "Candidate stage",
      directionIds: ["ai"],
      itemIds: ["p1"],
      origin: "ai",
    },
  ];
  s.archives = [
    {
      id: "a1",
      title: "Saved learning",
      projectId: "p2",
      question: "Q",
      answer: "A",
    },
  ];
  return normalizeState(s);
}
const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children)]);
test("one canonical owner with secondary-goal references preserves nested projects, plans and records", () => {
  const s = state(),
    roots = buildHierarchy(s);
  const nodes = flatten(roots);
  assert.equal(
    nodes.filter((n) => n.key === "projects:p1" && !n.reference).length,
    1,
  );
  assert.equal(
    nodes.filter((n) => n.reference && n.targetKey === "projects:p1").length,
    1,
  );
  assert.ok(
    nodes
      .find((n) => n.key === "projects:p1")
      .children.some((n) => n.key === "projects:p2"),
  );
  assert.ok(
    nodes
      .find((n) => n.key === "projects:p1")
      .children.some((n) => n.key === "plans:plan1"),
  );
  assert.equal(primaryGoalId(s, s.archives[0]), "g1");
});
test("invalid ownership and cross-collection cycles are rejected atomically", () => {
  for (const parent of [
    ref("projects", "missing"),
    ref("projects", "p1"),
    ref("sources", "x"),
  ]) {
    const s = state();
    s.projects[0].parentRef = parent;
    assert.throws(() => normalizeState(s));
  }
  const s = state();
  s.projects[0].parentRef = ref("projects", "p2");
  assert.throws(() => normalizeState(s), /环/);
});
test("search retains ancestor paths without duplicating entity bodies", () => {
  const roots = buildHierarchy(state(), (r) => r.title === "Saved learning");
  const nodes = flatten(roots);
  assert.ok(nodes.some((n) => n.key === "goals:g1"));
  assert.ok(nodes.some((n) => n.key === "projects:p1"));
  assert.ok(nodes.some((n) => n.key === "archives:a1"));
  assert.ok(!nodes.some((n) => n.key === "plans:plan1"));
});
test("new source ownership fills untouched imported records but protects manual ownership changes", async () => {
  const empty = createWorkspace(false),
    base = {
      format: "strategy-workbench-update",
      version: 1,
      batchId: "base",
      records: {
        goals: [
          { id: "g1", title: "G1" },
          { id: "g2", title: "G2" },
        ],
        projects: [{ id: "p", title: "P", goalIds: ["g1", "g2"] }],
      },
    };
  const first = applyUpdate(empty, await prepareUpdate(empty, base));
  const update = {
    ...base,
    batchId: "parent",
    records: { projects: [{ id: "p", parentRef: ref("goals", "g1") }] },
  };
  const next = applyUpdate(first, await prepareUpdate(first, update));
  assert.deepEqual(next.projects[0].parentRef, ref("goals", "g1"));
  next.projects[0].parentRef = ref("goals", "g2");
  const third = {
    ...update,
    batchId: "parent-2",
    records: {
      projects: [
        { id: "p", parentRef: ref("goals", "g1"), summary: "updated" },
      ],
    },
  };
  assert.deepEqual(
    applyUpdate(next, await prepareUpdate(next, third)).projects[0].parentRef,
    ref("goals", "g2"),
  );
});
test("explicit import mappings rewrite ownership references and repeated files stay unchanged", async () => {
  const s = state(),
    packet = {
      format: "strategy-workbench-update",
      version: 1,
      batchId: "alias-parent",
      records: {
        projects: [{ id: "remote", title: "Remote project" }],
        plans: [
          {
            id: "new-stage",
            title: "New stage",
            parentRef: ref("projects", "remote"),
          },
        ],
      },
    };
  const next = applyUpdate(
    s,
    await prepareUpdate(s, packet, { aliases: { "projects:remote": "p1" } }),
  );
  assert.deepEqual(
    next.plans.find((p) => p.id === "new-stage").parentRef,
    ref("projects", "p1"),
  );
  assert.deepEqual(applyUpdate(next, await prepareUpdate(next, packet)), next);
});
test("manual automatic ownership survives a later source assignment", async () => {
  const empty = createWorkspace(false);
  const packet = {
    format: "strategy-workbench-update",
    version: 1,
    batchId: "manual-auto-base",
    records: {
      goals: [{ id: "g", title: "Goal" }],
      projects: [{ id: "p", title: "Practice", goalIds: ["g"] }],
    },
  };
  const first = applyUpdate(empty, await prepareUpdate(empty, packet));
  first.projects[0].parentRef = null;
  first.projects[0].parentCustomized = true;
  const update = {
    ...packet,
    batchId: "manual-auto-update",
    records: { projects: [{ id: "p", parentRef: ref("goals", "g") }] },
  };
  const preview = await prepareUpdate(first, update);
  assert.equal(
    preview.changes[0].fields.find((f) => f.name === "parentRef").status,
    "conflict",
  );
  assert.equal(applyUpdate(first, preview).projects[0].parentRef, null);
});
test("plans and archives retain secondary-goal references with one canonical body", () => {
  const s = state();
  s.plans[0].goalIds = ["g1", "g2"];
  s.archives[0].goalIds = ["g1", "g2"];
  const nodes = flatten(buildHierarchy(normalizeState(s)));
  for (const key of ["plans:plan1", "archives:a1"]) {
    assert.equal(nodes.filter((n) => n.key === key && !n.reference).length, 1);
    assert.equal(
      nodes.filter((n) => n.reference && n.targetKey === key).length,
      1,
    );
  }
});
test("legacy self and mutual item associations remain restorable without becoming ownership", () => {
  const s = state();
  delete s.projects[1].parentRef;
  s.projects[0].itemIds = ["p1", "p2"];
  s.projects[1].itemIds = ["p1"];
  const normalized = normalizeState(s);
  assert.deepEqual(normalized.projects[0].itemIds, ["p1", "p2"]);
  const nodes = flatten(buildHierarchy(normalized));
  assert.equal(
    nodes.filter((n) => n.collection === "projects" && !n.reference).length,
    2,
  );
  assert.equal(primaryGoalId(normalized, normalized.projects[0]), "g1");
});
test("large deep hierarchies resolve primary goals through an index without linear record lookups", () => {
  const s = state();
  s.projects = [];
  s.plans = [];
  s.archives = [];
  for (let i = 0; i < 300; i++)
    s.projects.push({
      id: "deep" + i,
      title: "Deep " + i,
      goalIds: ["g1", "g2"],
      parentRef: ref(i ? "projects" : "goals", i ? "deep" + (i - 1) : "g1"),
      steps: [],
    });
  let calls = 0;
  s.projects.find = () => {
    calls++;
    return undefined;
  };
  const roots = buildHierarchy(s);
  assert.equal(calls, 0);
  assert.equal(roots[1].children.length, 300);
});
