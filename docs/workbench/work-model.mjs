import { parentOf } from "#workbench/hierarchy";
/** Canonical tasks; old steps/plans are input formats and retained source materials. */
export function normalizeWorkModel(value) {
  if (value == null) return { version: 1, links: {} };
  if (
    value.version !== 1 ||
    !value.links ||
    typeof value.links !== "object" ||
    Array.isArray(value.links)
  )
    throw Error("任务迁移索引格式不正确");
  const entries = Object.entries(value.links);
  if (entries.length > 30000) throw Error("任务迁移索引数量超限");
  for (const [key, id] of entries)
    if (key.length > 500 || typeof id !== "string" || !id || id.length > 100)
      throw Error("任务迁移映射不正确");
  return { version: 1, links: Object.fromEntries(entries) };
}
function stableId(key) {
  let hash = 14695981039346656037n;
  for (const ch of key) {
    hash ^= BigInt(ch.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return "migrated-" + hash.toString(36);
}
export function isProject(record) {
  return !["method", "idea"].includes(record.kind);
}
export function tasksForProject(state, id) {
  return state.tasks.filter((t) => t.projectId === id);
}
export function isFormalTask(task) {
  return task.adoption === "adopted" && !task.archived;
}
export function completeTask(state, id, done, expected = null) {
  const t = state.tasks.find((t) => t.id === id);
  if (!t) throw Error("任务已删除，请刷新后重试。");
  if (
    !isFormalTask(t) ||
    (expected &&
      [
        "done",
        "adoption",
        "execution",
        "archived",
        "title",
        "projectId",
        "scheduledFor",
        "priority",
      ].some((k) => t[k] !== expected[k]))
  )
    throw Error("任务状态已有变化，请刷新后重新确认。");
  t.done = done;
  t.execution = done ? "completed" : "not_started";
  t.demo = false;
}
export function upgradeWorkModel(state, normalizeRecord) {
  const links = state.workModel.links,
    taskIds = new Set(state.tasks.map((t) => t.id));
  let linkCount = Object.keys(links).length;
  const bySource = new Map(
    state.tasks.filter((t) => t.migrationKey).map((t) => [t.migrationKey, t]),
  );
  const planIndex = new Map(state.plans.map((p) => [p.id, p])),
    owners = new Map();
  function ownerOf(p) {
    if (owners.has(p.id)) return owners.get(p.id);
    const path = new Set([p.id]);
    let owner = parentOf("plans", p);
    while (owner?.collection === "plans") {
      if (path.has(owner.id)) throw Error("归属关系不能形成环");
      if (owners.has(owner.id)) {
        owner = owners.get(owner.id);
        break;
      }
      path.add(owner.id);
      const ancestor = planIndex.get(owner.id);
      if (!ancestor) throw Error("归属位置不存在：" + owner.id);
      owner = parentOf("plans", ancestor);
    }
    for (const id of path) owners.set(id, owner);
    return owner;
  }
  function migrate(key, raw) {
    if (Object.hasOwn(links, key)) return links[key];
    if (linkCount >= 30000)
      throw Error("任务迁移索引数量超限，请先备份并整理。");
    let task = bySource.get(key);
    if (!task) {
      if (state.tasks.length >= 10000)
        throw Error("迁移后任务超过10000项，请先备份并整理。");
      const base = stableId(key);
      let id = base,
        index = 0;
      while (taskIds.has(id)) id = base + "-" + ++index;
      task = normalizeRecord("tasks", { ...raw, id, migrationKey: key });
      state.tasks.push(task);
      taskIds.add(id);
      bySource.set(key, task);
    }
    links[key] = task.id;
    linkCount++;
    return task.id;
  }
  for (const p of state.projects) {
    for (const step of p.steps) {
      migrate(JSON.stringify(["step", p.id, step.id]), {
        title: step.title,
        done: step.done,
        projectId: p.id,
        itemIds: [p.id],
        goalIds: [...p.goalIds],
        directionIds: [...p.directionIds],
        origin: p.origin,
        adoption: p.adoption,
        archived: p.archived,
        demo: p.demo,
        sourceRefs: structuredClone(p.sourceRefs),
        sourceStepId: step.id,
      });
    }
    p.steps = [];
  }
  for (const p of state.plans) {
    if (p.materialType !== "action") continue;
    const owner = ownerOf(p);
    const projectId = owner?.collection === "projects" ? owner.id : "";
    p.migratedTaskId = migrate(JSON.stringify(["plan", p.id]), {
      title: p.title,
      done: p.execution === "completed" || p.status === "done",
      execution: p.execution,
      projectId,
      itemIds: [...p.itemIds],
      goalIds: Array.from(
        new Set([
          ...p.goalIds,
          ...(owner?.collection === "goals" ? [owner.id] : []),
        ]),
      ),
      directionIds: [...p.directionIds],
      origin: p.origin,
      adoption: p.adoption,
      archived: p.archived,
      demo: p.demo,
      sourceRefs: structuredClone(p.sourceRefs),
      body: p.summary,
      acceptance: p.acceptance,
      dueDate: p.dueDate,
      scheduledFor: p.scheduledFor || "",
      priority: p.priority || "normal",
    });
  }
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function taskBucket(task, now = new Date()) {
  if (!task.scheduledFor) return "unscheduled";
  const end = new Date(now);
  end.setDate(now.getDate() + 7);
  return task.scheduledFor <= localDate(end) ? "week" : "later";
}
