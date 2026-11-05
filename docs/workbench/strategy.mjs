import * as legacy from "./workspace-v1.mjs?v=20261105-strategy2";

export const COLLECTIONS = [
  "tasks",
  "projects",
  "plans",
  "notes",
  "sites",
  "experiments",
  "goals",
  "sources",
  "archives",
];
const BASE = ["tasks", "projects", "plans", "notes", "sites", "experiments"];
const DIRS = new Set(legacy.DIRECTIONS.map((d) => d.id));
const PROTECTED = new Set([
  "adoption",
  "execution",
  "done",
  "steps",
  "status",
  "dueDate",
  "directionIds",
  "goalIds",
  "itemIds",
  "relations",
  "origin",
  "nextStep",
]);
const LIMIT = 2 * 1024 * 1024;
const own = (value, key) => Object.hasOwn(value, key);
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
function requireObject(value, label) {
  if (!plain(value)) throw Error(label + "格式不正确");
  return value;
}
function text(value, label, max = 10000, required = false) {
  if (value === undefined || value === null) {
    if (required) throw Error(label + "不能为空");
    return "";
  }
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw Error(label + "为空或超过长度限制");
  return value;
}
function enumeration(value, allowed, fallback, label) {
  const result = value ?? fallback;
  if (!allowed.includes(result)) throw Error(label + "不正确");
  return result;
}
function ids(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000)
    throw Error(label + "格式不正确");
  const values = value.map((v) => text(v, label, 100, true));
  if (new Set(values).size !== values.length) throw Error(label + "含重复值");
  return values;
}
function iso(value, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw Error(label + "不正确");
  return value;
}
function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw Error("布尔值格式不正确");
  return value;
}
function url(value, label) {
  if (!value) return "";
  const result = legacy.safeUrl(value);
  if (!result || result.length > 2000)
    throw Error(label + "需要有效的 HTTP(S) 地址");
  return result;
}
function unique(records, label) {
  const set = new Set();
  for (const r of records) {
    if (set.has(r.id)) throw Error(label + "含重复标识");
    set.add(r.id);
  }
}
export function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (plain(value))
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
const equal = (a, b) => stable(a) === stable(b);

function normalizeRecord(collection, input, defaultOrigin = "user") {
  requireObject(input, "记录");
  const id = text(input.id, "记录标识", 100, true);
  let directions =
    input.directionIds === undefined
      ? input.direction
        ? [input.direction]
        : []
      : ids(input.directionIds, "关联方向");
  if (directions.some((d) => !DIRS.has(d))) throw Error("未知的长期方向");
  const origin = enumeration(
    input.origin,
    ["user", "ai", "mixed", "legacy", "example"],
    defaultOrigin,
    "来源类型",
  );
  let r;
  if (BASE.includes(collection)) {
    const record = { ...input, id, direction: directions[0] || "" };
    if (collection === "projects") record.steps = input.steps ?? [];
    if (collection === "tasks") record.done = input.done ?? false;
    if (collection === "plans") record.status = input.status ?? "next";
    if (collection === "experiments") {
      record.status = input.status ?? "idea";
      record.description = input.description ?? "";
    }
    const shell = Object.fromEntries(BASE.map((k) => [k, []]));
    shell[collection] = [record];
    r = legacy.validateWorkspace(shell)[collection][0];
  } else r = { id, title: text(input.title, "名称", 300, true) };
  if (collection === "sites") return r;
  r.directionIds = directions;
  r.origin = origin;
  r.archived = bool(input.archived);
  r.demo = bool(input.demo);
  r.sourceRefs = (input.sourceRefs ?? []).map((ref) => {
    requireObject(ref, "来源引用");
    return {
      sourceId: text(ref.sourceId, "来源标识", 100, true),
      messageId: text(ref.messageId, "消息标识", 100),
      excerpt: text(ref.excerpt, "来源摘录", 3000),
      kind: enumeration(
        ref.kind,
        ["intent", "suggestion", "evidence", "preference"],
        "evidence",
        "来源依据",
      ),
    };
  });
  if (collection !== "sources") {
    r.goalIds = ids(input.goalIds, "关联目标");
    r.itemIds = ids(input.itemIds, "关联事项");
  }
  if (collection === "goals") {
    r.why = text(input.why, "目标原因");
    r.status = enumeration(
      input.status,
      ["active", "paused", "archived"],
      "active",
      "目标状态",
    );
    r.confirmed = bool(input.confirmed, origin === "user");
  }
  if (collection === "projects" || collection === "plans") {
    r.adoption = enumeration(
      input.adoption,
      ["candidate", "adopted", "deferred", "rejected"],
      origin === "ai" ? "candidate" : "adopted",
      "采纳状态",
    );
    const executionDefault =
      collection === "plans" && origin !== "ai"
        ? { next: "not_started", active: "active", done: "completed" }[r.status]
        : "unknown";
    r.execution = enumeration(
      input.execution,
      ["unknown", "not_started", "active", "paused", "completed"],
      executionDefault,
      "执行状态",
    );
    r.summary = text(input.summary, "概述");
    r.nextStep = text(input.nextStep, "下一步");
    r.acceptance = text(input.acceptance, "验收要求");
  }
  if (collection === "projects") {
    r.kind = enumeration(
      input.kind,
      ["project", "learning", "research", "method", "idea"],
      "learning",
      "事项类型",
    );
    r.practiceRule = text(input.practiceRule, "跟进规则", 3000);
    r.relations = (input.relations ?? []).map((link) => {
      requireObject(link, "事项关联");
      return {
        type: enumeration(
          link.type,
          ["related", "method", "research", "depends"],
          "related",
          "关联类型",
        ),
        targetId: text(link.targetId, "目标事项", 100, true),
        confirmed: bool(link.confirmed),
      };
    });
  }
  if (collection === "sources") {
    r.shareUrl = url(input.shareUrl, "分享链接");
    r.conversationUrl = url(input.conversationUrl, "原对话链接");
    r.aliases = (input.aliases ?? []).map((v) => url(v, "来源别名"));
    r.sourceTime = iso(input.sourceTime, "原始时间");
    r.capturedAt = iso(input.capturedAt, "归档时间");
  }
  if (collection === "archives") {
    r.projectId = text(input.projectId, "主题事项", 100);
    r.sourceId = text(input.sourceId, "原始来源", 100);
    r.messageIds = ids(input.messageIds, "消息标识");
    for (const key of [
      "question",
      "answer",
      "feedback",
      "blindSpots",
      "nextQuestion",
      "nextAction",
      "score",
      "excerpt",
    ])
      r[key] = text(input[key], key, key === "feedback" ? 20000 : 10000);
    const inferred = !r.answer
      ? r.question
        ? "waiting_answer"
        : "verify"
      : !r.feedback
        ? "waiting_feedback"
        : "recorded";
    r.status = enumeration(
      input.status,
      ["waiting_answer", "waiting_feedback", "recorded", "verify"],
      inferred,
      "归档状态",
    );
    r.statusMode = enumeration(
      input.statusMode,
      ["derived", "confirmed"],
      own(input, "status") ? "confirmed" : "derived",
      "归档状态依据",
    );
    r.sourceTime = iso(input.sourceTime, "原始时间");
    r.capturedAt = iso(input.capturedAt, "归档时间");
  }
  return r;
}

function references(state) {
  const goals = new Set(state.goals.map((x) => x.id)),
    items = new Set(state.projects.map((x) => x.id)),
    sources = new Set(state.sources.map((x) => x.id));
  for (const collection of COLLECTIONS)
    for (const r of state[collection]) {
      for (const id of r.goalIds || [])
        if (!goals.has(id)) throw Error("目标引用不存在：" + id);
      for (const id of r.itemIds || [])
        if (!items.has(id)) throw Error("事项引用不存在：" + id);
      for (const ref of r.sourceRefs || [])
        if (!sources.has(ref.sourceId))
          throw Error("来源引用不存在：" + ref.sourceId);
      if (collection === "archives") {
        if (r.projectId && !items.has(r.projectId))
          throw Error("归档主题不存在：" + r.projectId);
        if (r.sourceId && !sources.has(r.sourceId))
          throw Error("归档来源不存在：" + r.sourceId);
      }
      if (collection === "projects")
        for (const link of r.relations) {
          if (!items.has(link.targetId))
            throw Error("关联事项不存在：" + link.targetId);
          if (link.targetId === r.id) throw Error("事项不能关联或依赖自身");
        }
    }
  const visiting = new Set(),
    finished = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error("已确认的前置依赖不能形成环");
    if (finished.has(id)) return;
    visiting.add(id);
    for (const edge of state.projects.find((p) => p.id === id).relations)
      if (edge.type === "depends" && edge.confirmed) visit(edge.targetId);
    visiting.delete(id);
    finished.add(id);
  }
  state.projects.forEach((p) => visit(p.id));
}

export function normalizeState(input) {
  requireObject(input, "工作区");
  const state = {};
  for (const key of COLLECTIONS) {
    const array = input[key] ?? (BASE.includes(key) ? null : []);
    if (!Array.isArray(array) || array.length > 1000)
      throw Error(key + "格式或数量不正确");
    state[key] = array.map((r) => normalizeRecord(key, r));
    unique(state[key], key);
  }
  const imports = input.imports ?? {};
  requireObject(imports, "归档索引");
  const baselines = imports.baselines ?? {},
    aliases = imports.aliases ?? {};
  requireObject(baselines, "归档基准");
  requireObject(aliases, "归档别名");
  state.imports = {
    baselines: Object.fromEntries(
      Object.entries(baselines).map(([key, value]) => {
        const collection = key.slice(0, key.indexOf(":"));
        if (!COLLECTIONS.includes(collection)) throw Error("未知的归档基准");
        return [key, normalizeRecord(collection, value)];
      }),
    ),
    aliases: Object.fromEntries(
      Object.entries(aliases).map(([key, value]) => {
        if (!COLLECTIONS.includes(key.slice(0, key.indexOf(":"))))
          throw Error("未知的归档映射");
        return [key, text(value, "归档映射", 100, true)];
      }),
    ),
    batches: (imports.batches ?? []).map((batch) => ({
      id: text(batch.id, "批次标识", 100, true),
      fingerprint: text(batch.fingerprint, "批次指纹", 128, true),
    })),
  };
  if (state.imports.batches.length > 1000) throw Error("归档批次数量超限");
  unique(state.imports.batches, "归档批次");
  if (
    !Array.isArray(input.revisions ?? []) ||
    (input.revisions ?? []).length > 3000
  )
    throw Error("修订记录数量超限");
  state.revisions = (input.revisions ?? []).map((rev) => {
    requireObject(rev, "修订");
    requireObject(rev.fields, "修订内容");
    if (!COLLECTIONS.includes(rev.collection)) throw Error("修订类型不正确");
    return {
      collection: rev.collection,
      id: text(rev.id, "修订对象", 100, true),
      at: iso(rev.at, "修订时间"),
      kind: text(rev.kind, "修订类型", 100),
      fields: structuredClone(rev.fields),
    };
  });
  references(state);
  return state;
}

export function migrateLegacy(input) {
  const old = legacy.validateWorkspace(input),
    state = {
      ...old,
      goals: [],
      sources: [],
      archives: [],
      imports: { baselines: {}, aliases: {}, batches: [] },
      revisions: [],
    };
  for (const key of BASE)
    if (key !== "sites")
      for (const r of state[key]) {
        r.directionIds = r.direction ? [r.direction] : [];
        r.origin = r.demo ? "example" : "legacy";
      }
  return normalizeState(state);
}

export function createStrategyState(examples = true) {
  const state = migrateLegacy(legacy.createWorkspace(examples));
  if (examples) {
    state.goals = [
      {
        id: "example-goal-ai",
        title: "把工具变成可复用的能力",
        why: "用真实问题验证学习，而不只收藏资料。",
        directionIds: ["ai", "learn"],
        demo: true,
        confirmed: false,
      },
      {
        id: "example-goal-invest",
        title: "形成有依据的投资判断",
        why: "保留判断、证据和反证条件。",
        directionIds: ["invest"],
        demo: true,
        confirmed: false,
      },
    ];
    state.projects[0].goalIds = ["example-goal-invest"];
    state.projects[1].goalIds = ["example-goal-ai"];
    state.projects[0].nextStep = "选一个可以独立解释的问题";
    state.projects[1].nextStep = "定义一个可验证的小任务";
    state.archives = [
      {
        id: "example-round",
        title: "下一次学习从这里继续",
        projectId: state.projects[1].id,
        question: "怎样证明自己真正掌握了一个方法？",
        directionIds: ["ai", "learn"],
        demo: true,
        nextAction: "回到自己的对话，先独立作答。",
      },
    ];
  }
  return normalizeState(state);
}

export function parseUpdate(value) {
  let packet;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).length > LIMIT)
      throw Error("归档文件不能超过 2 MiB");
    try {
      packet = JSON.parse(value);
    } catch {
      throw Error("归档文件不是有效 JSON");
    }
  } else packet = structuredClone(value);
  requireObject(packet, "归档文件");
  if (packet.format !== "strategy-workbench-update" || packet.version !== 1)
    throw Error("这不是受支持的归档更新文件");
  text(packet.batchId, "批次标识", 100, true);
  requireObject(packet.records, "归档记录");
  for (const [key, records] of Object.entries(packet.records)) {
    if (
      !COLLECTIONS.includes(key) ||
      !Array.isArray(records) ||
      records.length > 1000
    )
      throw Error("归档记录类型或数量不正确");
    records.forEach((r) => {
      requireObject(r, "归档记录");
      text(r.id, "记录标识", 100, true);
    });
    unique(records, key);
  }
  if (new TextEncoder().encode(JSON.stringify(packet)).length > LIMIT)
    throw Error("归档文件不能超过 2 MiB");
  return packet;
}

function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (plain(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !["capturedAt", "importedAt", "generatedAt", "batchId"].includes(k),
        )
        .map(([k, v]) => [k, semantic(v)]),
    );
  return value;
}
async function fingerprint(packet) {
  const canonical = semantic(packet);
  for (const records of Object.values(canonical.records))
    records.sort((a, b) => a.id.localeCompare(b.id));
  const bytes = new TextEncoder().encode(stable(canonical));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function rewrite(record, collection, aliases) {
  const map = (type, id) => aliases[`${type}:${id}`] ?? id,
    r = structuredClone(record);
  r.id = map(collection, r.id);
  if (r.goalIds) r.goalIds = r.goalIds.map((id) => map("goals", id));
  if (r.itemIds) r.itemIds = r.itemIds.map((id) => map("projects", id));
  if (r.projectId) r.projectId = map("projects", r.projectId);
  if (r.sourceId) r.sourceId = map("sources", r.sourceId);
  if (r.sourceRefs)
    r.sourceRefs = r.sourceRefs.map((ref) => ({
      ...ref,
      sourceId: map("sources", ref.sourceId),
    }));
  if (r.relations)
    r.relations = r.relations.map((link) => ({
      ...link,
      targetId: map("projects", link.targetId),
    }));
  return r;
}

export async function prepareUpdate(input, raw, options = {}) {
  const state = normalizeState(input),
    packet = parseUpdate(raw),
    digest = await fingerprint(packet);
  const previous = state.imports.batches.find((b) => b.id === packet.batchId);
  if (previous && previous.fingerprint !== digest)
    throw Error("同一批次的内容发生变化，请使用新的批次标识");
  const preview = {
    batchId: packet.batchId,
    fingerprint: digest,
    baseToken: stable(state),
    changes: [],
    aliases: { ...state.imports.aliases, ...options.aliases },
    duplicate: !!previous,
  };
  if (previous || state.imports.batches.some((b) => b.fingerprint === digest)) {
    preview.duplicate = true;
    return preview;
  }
  for (const [key, id] of Object.entries(options.aliases ?? {})) {
    const type = key.slice(0, key.indexOf(":"));
    if (!COLLECTIONS.includes(type) || !state[type].some((r) => r.id === id))
      throw Error("映射的本地记录不存在");
  }
  const seen = new Set();
  for (const [collection, records] of Object.entries(packet.records))
    for (const rawRecord of records) {
      let incomingRaw = rewrite(rawRecord, collection, preview.aliases);
      // Source/message identity is stronger than a newly generated archive ID.
      // Never match by a similar title or a single overlapping message.
      if (
        collection === "archives" &&
        !state.archives.some((r) => r.id === incomingRaw.id) &&
        incomingRaw.sourceId
      ) {
        const matches = state.archives.filter((r) => {
          if (r.sourceId !== incomingRaw.sourceId) return false;
          if (incomingRaw.messageIds?.length)
            return equal(
              [...r.messageIds].sort(),
              [...incomingRaw.messageIds].sort(),
            );
          const fields = [
            "projectId",
            "question",
            "answer",
            "feedback",
            "excerpt",
          ];
          return (
            ["question", "answer", "feedback", "excerpt"].some(
              (k) => incomingRaw[k],
            ) && fields.every((k) => equal(r[k] || "", incomingRaw[k] || ""))
          );
        });
        if (matches.length > 1)
          throw Error("同一来源消息对应多条记录，请先明确关联后再导入");
        if (matches.length === 1) {
          preview.aliases[`archives:${rawRecord.id}`] = matches[0].id;
          incomingRaw = rewrite(rawRecord, collection, preview.aliases);
        }
      }
      const key = `${collection}:${incomingRaw.id}`;
      if (seen.has(key))
        throw Error("同一批次不能将多条记录映射到同一个本地对象");
      seen.add(key);
      const current = state[collection].find((x) => x.id === incomingRaw.id),
        base = state.imports.baselines[key];
      const sourceRecord = { ...(base ?? current ?? {}), ...incomingRaw };
      const inferStatus =
        collection === "archives" &&
        !own(incomingRaw, "status") &&
        sourceRecord.statusMode !== "confirmed" &&
        ["question", "answer", "feedback"].some((k) => own(incomingRaw, k));
      if (inferStatus) {
        delete sourceRecord.status;
        sourceRecord.statusMode = "derived";
      }
      if (collection === "archives" && own(incomingRaw, "status"))
        sourceRecord.statusMode = "confirmed";
      const incoming = normalizeRecord(collection, sourceRecord, "ai");
      if (!current && incoming.origin === "ai" && incoming.relations)
        incoming.relations = incoming.relations.map((r) =>
          r.type === "depends" ? { ...r, confirmed: false } : r,
        );
      const names = new Set(
        Object.keys(incomingRaw).filter((k) => k !== "id" && k !== "direction"),
      );
      if (own(incomingRaw, "direction")) names.add("directionIds");
      if (inferStatus) names.add("status");
      if (collection === "archives" && own(incomingRaw, "status"))
        names.add("statusMode");
      const fields = [];
      if (current)
        for (const name of names) {
          if (!own(incoming, name)) continue;
          const local = current[name],
            remote = incoming[name],
            before = base?.[name];
          let status;
          if (equal(local, remote) || (base && equal(before, remote)))
            status = "same";
          else if (
            (PROTECTED.has(name) && !(inferStatus && name === "status")) ||
            !base ||
            !equal(local, before)
          )
            status = "conflict";
          else status = "update";
          fields.push({
            name,
            current: local,
            base: before,
            incoming: remote,
            status,
            protected:
              PROTECTED.has(name) && !(inferStatus && name === "status"),
          });
        }
      const action = !current
        ? "add"
        : fields.some((f) => f.status === "conflict")
          ? "conflict"
          : fields.some((f) => f.status === "update")
            ? "update"
            : "noop";
      preview.changes.push({
        collection,
        id: incoming.id,
        incomingId: rawRecord.id,
        key,
        current: current ?? null,
        incoming,
        fields,
        action,
      });
    }
  return preview;
}

export function applyUpdate(input, preview, decisions = {}) {
  const state = normalizeState(input);
  if (stable(state) !== preview.baseToken)
    throw Error("预览后工作区已有变化，请重新生成预览");
  if (preview.duplicate) return structuredClone(state);
  const selected = new Set(
    decisions.selected ?? preview.changes.map((r) => r.key),
  );
  const result = structuredClone(state);
  let changed = false;
  for (const row of preview.changes) {
    if (!selected.has(row.key)) continue;
    const index = result[row.collection].findIndex((r) => r.id === row.id);
    if (index < 0) {
      result[row.collection].push(structuredClone(row.incoming));
      changed = true;
    } else {
      const record = result[row.collection][index],
        changes = {};
      for (const field of row.fields) {
        const choice =
          decisions.fields?.[row.key]?.[field.name] ??
          (field.status === "update" ? "incoming" : "local");
        if (
          choice === "incoming" &&
          !equal(record[field.name], field.incoming)
        ) {
          changes[field.name] = {
            before: structuredClone(record[field.name] ?? null),
            after: structuredClone(field.incoming ?? null),
          };
          record[field.name] = structuredClone(field.incoming);
        }
      }
      if (Object.keys(changes).length) {
        result.revisions.push({
          collection: row.collection,
          id: row.id,
          at: new Date().toISOString(),
          kind: "归档合并",
          fields: changes,
        });
        changed = true;
      }
    }
    if (!equal(result.imports.baselines[row.key], row.incoming)) {
      result.imports.baselines[row.key] = structuredClone(row.incoming);
      changed = true;
    }
  }
  for (const [key, id] of Object.entries(preview.aliases)) {
    const row = preview.changes.find(
      (r) => `${r.collection}:${r.incomingId}` === key,
    );
    if ((!row || selected.has(row.key)) && result.imports.aliases[key] !== id) {
      result.imports.aliases[key] = id;
      changed = true;
    }
  }
  if (!changed) return state;
  if (
    preview.changes.every(
      (row) => selected.has(row.key) || row.action === "noop",
    )
  )
    result.imports.batches.push({
      id: preview.batchId,
      fingerprint: preview.fingerprint,
    });
  const normalized = normalizeState(result);
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > LIMIT)
    throw Error("合并后超过 2 MiB 上限，请先备份并整理内容");
  return normalized;
}

export function trackRevisions(before, after, kind = "手工修改") {
  if ((after.revisions ?? []).length > (before.revisions ?? []).length)
    return after;
  const result = structuredClone(after);
  for (const collection of [
    "goals",
    "projects",
    "plans",
    "archives",
    "tasks",
    "sources",
  ])
    for (const record of result[collection]) {
      const old = before[collection].find((r) => r.id === record.id);
      if (!old) continue;
      const fields = {};
      for (const key of Object.keys(record))
        if (!equal(old[key], record[key]))
          fields[key] = { before: old[key] ?? null, after: record[key] };
      if (Object.keys(fields).length)
        result.revisions.push({
          collection,
          id: record.id,
          at: new Date().toISOString(),
          kind,
          fields,
        });
    }
  return result;
}

export function clearExamples(input) {
  const s = normalizeState(input),
    keep = Object.fromEntries(
      COLLECTIONS.map((k) => [
        k,
        new Set(s[k].filter((r) => !r.demo || k === "sites").map((r) => r.id)),
      ]),
    );
  let expanded = true;
  while (expanded) {
    expanded = false;
    const add = (key, id) => {
      if (id && !keep[key].has(id)) {
        keep[key].add(id);
        expanded = true;
      }
    };
    for (const key of COLLECTIONS)
      for (const r of s[key])
        if (keep[key].has(r.id)) {
          (r.goalIds || []).forEach((id) => add("goals", id));
          (r.itemIds || []).forEach((id) => add("projects", id));
          (r.sourceRefs || []).forEach((ref) => add("sources", ref.sourceId));
          if (key === "projects")
            r.relations.forEach((link) => add("projects", link.targetId));
          if (key === "archives") {
            add("projects", r.projectId);
            add("sources", r.sourceId);
          }
        }
  }
  for (const key of COLLECTIONS)
    s[key] = s[key].filter((r) => keep[key].has(r.id));
  return normalizeState(s);
}
