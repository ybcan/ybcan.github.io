import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateLegacy,
  createStrategyState,
  normalizeState,
  prepareUpdate,
  applyUpdate,
} from "../docs/workbench/strategy.mjs";

const old = () => ({
  tasks: [{ id: "t", title: "完成过的任务", direction: "ai", done: true }],
  projects: [
    {
      id: "p",
      title: "原有学习",
      direction: "learn",
      steps: [{ id: "step", title: "练习", done: true }],
    },
  ],
  plans: [{ id: "plan", title: "原有计划", direction: "ai", status: "active" }],
  notes: [{ id: "note", body: "原有笔记", direction: "" }],
  sites: [{ id: "site", name: "网站", url: "https://example.com/" }],
  experiments: [],
});
const packet = (id, records) => ({
  format: "strategy-workbench-update",
  version: 1,
  batchId: id,
  records,
});
const goal = {
  id: "goal-a",
  title: "提高分析能力",
  directionIds: ["ai", "learn"],
  why: "解决真实问题",
};
const item = {
  id: "item-a",
  title: "主题甲",
  directionIds: ["ai", "learn"],
  goalIds: ["goal-a"],
  kind: "learning",
  origin: "user",
  adoption: "adopted",
  execution: "active",
  steps: [],
  summary: "来源中的概述",
  nextStep: "独立尝试",
};

test("migration preserves exact identities, completion and plan status without inventing overall mastery", () => {
  const state = migrateLegacy(old());
  assert.equal(state.tasks[0].done, true);
  assert.equal(
    state.tasks.find((t) => t.sourceStepId === "step").sourceStepId,
    "step",
  );
  assert.equal(state.tasks.find((t) => t.sourceStepId === "step").done, true);
  assert.equal(state.projects[0].execution, "unknown");
  assert.deepEqual(state.projects[0].directionIds, ["learn"]);
  assert.deepEqual(state.projects[0].goalIds, []);
  assert.equal(state.plans[0].status, "active");
  assert.equal(state.notes[0].body, "原有笔记");
});

test("multi-goal links are preserved and dangling references/cycles are rejected", () => {
  const s = createStrategyState(false);
  s.goals.push(goal, { ...goal, id: "goal-b", title: "另一个目标" });
  s.projects.push({ ...item, goalIds: ["goal-a", "goal-b"] });
  assert.deepEqual(normalizeState(s).projects[0].goalIds, ["goal-a", "goal-b"]);
  s.projects[0].goalIds = ["missing"];
  assert.throws(() => normalizeState(s));
  s.projects[0].goalIds = ["goal-a"];
  s.projects.push({ ...item, id: "item-b" });
  s.projects[0].relations = [
    { type: "depends", targetId: "item-b", confirmed: true },
  ];
  s.projects[1].relations = [
    { type: "depends", targetId: "item-a", confirmed: true },
  ];
  assert.throws(() => normalizeState(s));
});

test("AI proposals default to unconfirmed adoption and unknown execution", async () => {
  const s = createStrategyState(false);
  const preview = await prepareUpdate(
    s,
    packet("p", {
      projects: [{ id: "proposal", title: "AI 提议的路线", steps: [] }],
    }),
  );
  const result = applyUpdate(s, preview);
  assert.equal(result.projects[0].adoption, "candidate");
  assert.equal(result.projects[0].execution, "unknown");
});

test("first import adds linked records atomically and repeated content is idempotent", async () => {
  let s = createStrategyState(false);
  const data = packet("first", { goals: [goal], projects: [item] });
  s = applyUpdate(s, await prepareUpdate(s, data));
  assert.equal(s.projects.length, 1);
  assert.equal(s.goals.length, 1);
  const saved = JSON.stringify(s);
  assert.equal(
    JSON.stringify(applyUpdate(s, await prepareUpdate(s, data))),
    saved,
  );
  assert.equal(
    JSON.stringify(
      applyUpdate(
        s,
        await prepareUpdate(s, { ...data, batchId: "same-content" }),
      ),
    ),
    saved,
  );
});

test("three-way update changes untouched source fields but preserves local next step and execution", async () => {
  let s = createStrategyState(false);
  s = applyUpdate(
    s,
    await prepareUpdate(
      s,
      packet("first", { goals: [goal], projects: [item] }),
    ),
  );
  s.projects[0].nextStep = "我自己的下一步";
  s.projects[0].execution = "paused";
  const update = packet("second", {
    projects: [
      {
        ...item,
        summary: "新的来源概述",
        nextStep: "新的 AI 建议",
        execution: "active",
      },
    ],
  });
  const preview = await prepareUpdate(s, update);
  const row = preview.changes.find((x) => x.collection === "projects");
  assert.ok(
    row.fields.some((x) => x.name === "nextStep" && x.status === "conflict"),
  );
  const result = applyUpdate(s, preview);
  assert.equal(result.projects[0].summary, "新的来源概述");
  assert.equal(result.projects[0].nextStep, "我自己的下一步");
  assert.equal(result.projects[0].execution, "paused");
  const accepted = applyUpdate(s, preview, {
    fields: { [row.key]: { nextStep: "incoming" } },
  });
  assert.equal(accepted.projects[0].nextStep, "新的 AI 建议");
});

test("a stale preview cannot overwrite a local edit", async () => {
  const s = createStrategyState(false);
  const preview = await prepareUpdate(s, packet("x", { goals: [goal] }));
  s.notes.push({ id: "new", body: "预览后新增", direction: "" });
  assert.throws(() => applyUpdate(s, preview), /变化|更新|过期/);
});

test("unselected dependencies cannot produce a partial dangling import", async () => {
  const s = createStrategyState(false);
  const preview = await prepareUpdate(
    s,
    packet("x", { goals: [goal], projects: [item] }),
  );
  const key = preview.changes.find((x) => x.collection === "projects").key;
  assert.throws(() => applyUpdate(s, preview, { selected: [key] }));
  assert.equal(s.projects.length, 0);
});

test("source links reject unsafe schemes and archive states preserve unanswered questions", async () => {
  const s = createStrategyState(false);
  await assert.rejects(() =>
    prepareUpdate(
      s,
      packet("bad", {
        sources: [
          { id: "s", title: "错误链接", shareUrl: "javascript:alert(1)" },
        ],
      }),
    ),
  );
  const p = await prepareUpdate(
    s,
    packet("good", {
      archives: [
        {
          id: "a",
          title: "待答",
          question: "如何验证？",
          answer: "",
          feedback: "",
        },
      ],
    }),
  );
  const result = applyUpdate(s, p);
  assert.equal(result.archives[0].status, "waiting_answer");
  assert.equal(result.archives[0].sourceTime, null);
});

test("explicit import aliases link a new source record to an existing local item", async () => {
  const s = migrateLegacy(old());
  const p = await prepareUpdate(
    s,
    packet("link", {
      projects: [{ id: "source-item", title: "来源标题", steps: [] }],
      archives: [
        {
          id: "round",
          title: "问答",
          projectId: "source-item",
          question: "下一步是什么？",
        },
      ],
    }),
    { aliases: { "projects:source-item": "p" } },
  );
  const result = applyUpdate(s, p);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].id, "p");
  assert.equal(result.projects[0].title, "原有学习");
  assert.equal(result.archives[0].projectId, "p");
});

test("v1 storage migrates without writing or deleting its original key", async () => {
  const v1 = await import("../docs/workbench/workspace-v1.mjs");
  const v2 = await import("../docs/workbench/workspace.mjs");
  const raw = v1.serializeBackup(v1.createWorkspace());
  const values = new Map([[v1.STORAGE_KEY, raw]]);
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  const result = v2.loadWorkspace(storage);
  assert.equal(result.status, "migrated");
  assert.equal(values.size, 1);
  v2.saveWorkspace(storage, result.state);
  assert.notEqual(v2.STORAGE_KEY, v1.STORAGE_KEY);
  assert.equal(values.get(v1.STORAGE_KEY), raw);
  assert.equal(v2.loadWorkspace(storage).status, "saved");
  assert.deepEqual(
    v2.parseBackup(v2.serializeBackup(result.state)),
    result.state,
  );
});

test("capture timestamps do not create a second semantic import under a new batch", async () => {
  const start = createStrategyState(false);
  const p = {
    format: "strategy-workbench-update",
    version: 1,
    batchId: "capture-1",
    records: {
      sources: [
        {
          id: "src",
          title: "Source",
          shareUrl: "https://example.com/",
          capturedAt: "2026-11-01T00:00:00Z",
        },
      ],
    },
  };
  const first = applyUpdate(start, await prepareUpdate(start, p));
  p.batchId = "capture-2";
  p.records.sources[0].capturedAt = "2026-11-02T00:00:00Z";
  assert.deepEqual(applyUpdate(first, await prepareUpdate(first, p)), first);
});
test("partial selection leaves unselected records available on a later preview", async () => {
  const start = createStrategyState(false);
  const p = {
    format: "strategy-workbench-update",
    version: 1,
    batchId: "partial-1",
    records: {
      goals: [
        { id: "one", title: "One" },
        { id: "two", title: "Two" },
      ],
    },
  };
  const first = applyUpdate(start, await prepareUpdate(start, p), {
    selected: ["goals:one"],
  });
  const preview = await prepareUpdate(first, p);
  const final = applyUpdate(first, preview);
  assert.equal(final.goals.length, 2);
});

test("incremental answers infer archive status while preserving a manually confirmed status", async () => {
  const p = packet("round-start", {
    archives: [{ id: "round", title: "Round", question: "Q" }],
  });
  const initial = applyUpdate(
    createStrategyState(false),
    await prepareUpdate(createStrategyState(false), p),
  );
  const update = packet("round-answer", {
    archives: [{ id: "round", answer: "A", feedback: "F" }],
  });
  const result = applyUpdate(initial, await prepareUpdate(initial, update));
  assert.equal(result.archives[0].status, "recorded");
  const manual = structuredClone(initial);
  manual.archives[0].status = "verify";
  assert.equal(
    applyUpdate(manual, await prepareUpdate(manual, update)).archives[0].status,
    "verify",
  );
});

test("the same source messages retain archive identity even when an update changes its record id", async () => {
  const first = packet("source-message-1", {
    sources: [{ id: "source", title: "Source" }],
    archives: [
      {
        id: "old-id",
        title: "Round",
        sourceId: "source",
        messageIds: ["message-1"],
        question: "Q",
      },
    ],
  });
  const empty = createStrategyState(false),
    initial = applyUpdate(empty, await prepareUpdate(empty, first));
  const again = packet("source-message-2", {
    archives: [
      {
        id: "new-id",
        title: "Round",
        sourceId: "source",
        messageIds: ["message-1"],
        question: "Q",
      },
    ],
  });
  const next = applyUpdate(initial, await prepareUpdate(initial, again));
  assert.equal(next.archives.length, 1);
  assert.equal(next.archives[0].id, "old-id");
  const answer = packet("source-message-3", {
    archives: [{ id: "new-id", answer: "A" }],
  });
  const final = applyUpdate(next, await prepareUpdate(next, answer));
  assert.equal(final.archives.length, 1);
  assert.equal(final.archives[0].answer, "A");
});

test("explicit archive review status is retained when later content arrives", async () => {
  const empty = createStrategyState(false),
    p = packet("explicit-review", {
      archives: [{ id: "r", title: "R", question: "Q", status: "verify" }],
    });
  const first = applyUpdate(empty, await prepareUpdate(empty, p));
  const update = packet("explicit-review-answer", {
    archives: [{ id: "r", answer: "A", feedback: "F" }],
  });
  assert.equal(
    applyUpdate(first, await prepareUpdate(first, update)).archives[0].status,
    "verify",
  );
});
test("exact archive content from the same source is deduplicated without message ids", async () => {
  const empty = createStrategyState(false),
    r = {
      id: "r1",
      title: "R",
      sourceId: "src",
      question: "Q",
      answer: "A",
      feedback: "F",
    };
  const p = packet("semantic-round-1", {
    sources: [{ id: "src", title: "Source" }],
    archives: [r],
  });
  const first = applyUpdate(empty, await prepareUpdate(empty, p));
  const update = packet("semantic-round-2", {
    archives: [{ ...r, id: "r2", title: "Reworded title" }],
  });
  assert.equal(
    applyUpdate(first, await prepareUpdate(first, update)).archives.length,
    1,
  );
});
