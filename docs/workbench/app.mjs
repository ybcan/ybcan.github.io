import {
  DIRECTIONS,
  STORAGE_KEY,
  createWorkspace,
  validateWorkspace,
  loadWorkspace,
  saveWorkspace,
  serializeBackup,
  parseBackup,
  removeExamples,
  safeUrl,
  textStatistics,
  formatJson,
  FocusClock,
} from "#workbench/workspace";

import { initStrategy } from "#workbench/strategy-ui";
import { trackRevisions, stable } from "#workbench/strategy";

import { initAbout } from "#workbench/about";
import { initLayout } from "#workbench/layout";
import { el, icon } from "#workbench/dom";
import { initRecordEditor } from "#workbench/record-editor";
import { initWorkspaceViews } from "#workbench/workspace-views";
import { initTools } from "#workbench/tools";
import { openWorkspaceStore, volatileStore } from "#workbench/storage";
import { initBackupSettings } from "#workbench/backup-settings";
import { MAX_BACKUP_BYTES } from "#workbench/limits";

const $ = (id) => document.getElementById(id);
document
  .querySelectorAll("[data-icon]")
  .forEach((node) => node.replaceWith(icon(node.dataset.icon)));

const storage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
let store, initialRaw;
try {
  store = await openWorkspaceStore();
  initialRaw = await store.read();
} catch {
  store = volatileStore(storage);
  initialRaw = await store.read();
}
let initial;
try {
  initial = {
    state: initialRaw === null ? createWorkspace() : parseBackup(initialRaw),
    status: !store.available
      ? "unavailable"
      : initialRaw === null
        ? "new"
        : "saved",
    raw: initialRaw,
  };
} catch {
  initial = {
    state: createWorkspace(false),
    status: "corrupt",
    raw: initialRaw,
  };
}
let backupUI;
let state = initial.state;
let storageStatus = initial.status;
let corruptRaw = initial.status === "corrupt" ? initial.raw : null;
let savedSnapshot = initial.raw ?? null;
let volatileChanges = false;
let direction = "",
  query = "",
  view = "overview";
let toastTimeout;
let recordEditor, tools, workspaceViews;
function openRecord(...args) {
  return recordEditor.open(...args);
}
function openTool(kind) {
  return tools.open(kind);
}
const names = {
  tasks: "待办",
  projects: "学习",
  plans: "计划",
  notes: "笔记",
  sites: "网站",
  experiments: "实验",
};
let strategy;
const viewInfo = {
  archives: [
    "积累与归档",
    "每一次推进，都留下积累。",
    "学习记录、关键结论和完成历史，随时回看与继续。",
  ],
  overview: [
    "总览",
    "把今天，连到长远。",
    "学习、行动、想法与实验，在一个工作空间里继续。",
  ],
  learning: [
    "目标与项目",
    "让每一步，都连到目标。",
    "从长期目标找到学习、实践与研究，明确当前下一步。",
  ],
  tasks: [
    "待办事项",
    "从一件重要的事开始。",
    "少一点悬而未决，多一点实际行动。",
  ],
  lab: [
    "实验空间",
    "把想法，做成小东西。",
    "把随手记和小工具放在一起，留住想法，再动手验证。",
  ],
};

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $("toast").hidden = true;
  }, 3300);
}
function matches(item, useGoal = true) {
  if (useGoal !== false && strategy && !strategy.goalMatches(item))
    return false;
  if (direction && !(item.directionIds || [item.direction]).includes(direction))
    return false;
  return (
    !query ||
    [
      item.title,
      item.name,
      item.body,
      item.description,
      item.summary,
      item.why,
      item.nextStep,
      item.question,
      item.answer,
      item.feedback,
      item.excerpt,
      item.nextQuestion,
      item.nextAction,
      ...(item.goalIds || []).map(
        (id) => state.goals.find((g) => g.id === id)?.title,
      ),
      ...(item.steps || []).map((x) => x.title),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query)
  );
}
// A bad stored snapshot is never implicitly replaced. Volatile changes remain
// visible and exportable if the browser refuses a write.
let pendingWrites = 0;
let commitTail = Promise.resolve();
function commit(change, options = {}) {
  pendingWrites++;
  const job = commitTail
    .then(() => performCommit(change, options))
    .finally(() => {
      pendingWrites--;
    });
  commitTail = job.catch(() => {});
  return job;
}
async function performCommit(change, options) {
  if (corruptRaw !== null) {
    toast("请先恢复异常工作区，原始记录未被覆盖。");
    return false;
  }
  let next,
    baseline = savedSnapshot,
    invalid = false;
  const calculate = (raw) => {
    try {
      if (raw !== savedSnapshot && volatileChanges)
        throw Error(
          "其他标签页更新了工作区。本页有未保存内容，请先导出备份，再刷新。",
        );
      const base =
        raw === savedSnapshot
          ? state
          : raw === null
            ? createWorkspace(false)
            : parseBackup(raw);
      baseline = raw;
      next = structuredClone(base);
      change(next);
      next = validateWorkspace(trackRevisions(base, next));
      return serializeBackup(next);
    } catch (error) {
      invalid = true;
      throw error;
    }
  };
  try {
    savedSnapshot = await store.update(calculate);
    volatileChanges = false;
    storageStatus = "saved";
  } catch (error) {
    if (invalid || options.requirePersistence) {
      toast(error.message || "归档未保存，当前内容未替换。");
      return false;
    }
    if (!next) {
      try {
        calculate(savedSnapshot);
      } catch (error) {
        toast(error.message);
        return false;
      }
    }
    savedSnapshot = baseline;
    volatileChanges = true;
    storageStatus = "unavailable";
  }
  state = next;
  render();
  if (storageStatus === "unavailable")
    toast("仅暂存在本页。浏览器未能保存，请在刷新或关闭前导出备份。");
  else backupUI?.schedule();
  return true;
}
async function refreshForPreview() {
  if (corruptRaw !== null) throw Error("请先恢复异常工作区，再合并归档。");
  const raw = await store.read();
  if (raw === savedSnapshot) return;
  if (volatileChanges)
    throw Error(
      "本页有未保存内容，其他标签页也有更新。请先导出备份，再刷新后合并。",
    );
  state = raw === null ? createWorkspace(false) : parseBackup(raw);
  savedSnapshot = raw;
  storageStatus = "saved";
  render();
}
async function restoreWorkspace(imported) {
  await commitTail;
  const expected = await store.read();
  if (expected !== savedSnapshot) {
    if (volatileChanges)
      throw Error(
        "其他标签页已有变化，本页仍有未保存内容。请先导出，再重新确认恢复。",
      );
    state = expected === null ? createWorkspace(false) : parseBackup(expected);
    savedSnapshot = expected;
    corruptRaw = null;
    storageStatus = "saved";
    render();
  }
  const before = serializeBackup(state),
    stateToken = stable(state);
  if (
    !(await confirmAction(
      "替换当前工作区？",
      "备份已通过校验。恢复会替换当前记录，请确认选择正确的版本。",
      "确认恢复",
    ))
  )
    return false;
  if (backupUI && !(await backupUI.beforeRestore(before))) return false;
  const raw = serializeBackup(imported);
  savedSnapshot = await store.update((current) => {
    if (current !== expected || stable(state) !== stateToken)
      throw Error("确认期间工作区已有变化，请重新选择并确认恢复。");
    return raw;
  });
  state = imported;
  volatileChanges = false;
  corruptRaw = null;
  storageStatus = "saved";
  direction = "";
  query = "";
  $("global-search").value = "";
  render();
  backupUI?.schedule();
  settingsMessage("已恢复工作区。");
  return true;
}

function updateStorageStatus() {
  const collections = [
    "tasks",
    "projects",
    "plans",
    "notes",
    "experiments",
    "goals",
    "archives",
  ];
  const count = collections.reduce((n, key) => n + state[key].length, 0);
  const examples = collections.some((key) => state[key].some((x) => x.demo));
  $("example-status").textContent = examples
    ? "含示例 · 可在设置中清除"
    : "我的本地工作区";
  const warning = storageStatus === "unavailable" || corruptRaw !== null;
  $("status-light").classList.toggle("warning", warning);
  $("save-status").textContent =
    corruptRaw !== null
      ? "原始记录未覆盖，等待恢复"
      : storageStatus === "unavailable"
        ? "仅暂存本页，请及时导出"
        : storageStatus === "new"
          ? "示例内容，尚未保存个人记录"
          : storageStatus === "migrated"
            ? "已读取旧记录；下次保存写入新版，旧版备份保留"
            : `已在本地保存 ${count} 条记录`;
  $("storage-alert").hidden = !warning;
  $("storage-message").textContent =
    corruptRaw !== null
      ? "本地记录读取失败。原始数据未被覆盖，请到数据设置中恢复备份或下载原始数据。"
      : "浏览器未能保存数据。当前更改仅在本页可用，请在刷新或关闭前导出备份。";
  $("recovery-row").hidden = corruptRaw === null;
}

function render() {
  const focused = document.activeElement?.dataset?.focusKey;
  workspaceViews?.render();
  updateStorageStatus();
  strategy?.render();
  document.querySelectorAll("[data-direction]").forEach((b) => {
    b.classList.toggle("active", b.dataset.direction === direction);
    b.setAttribute("aria-pressed", String(b.dataset.direction === direction));
  });
  $("filter-bar").hidden = !direction && !query && !strategy?.goalId();
  $("filter-label").textContent = [
    DIRECTIONS.find((d) => d.id === direction)?.name,
    query ? `搜索：${$("global-search").value}` : "",
    strategy?.goalId()
      ? "目标：" + state.goals.find((g) => g.id === strategy.goalId())?.title
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (focused)
    document
      .querySelector(`[data-focus-key="${CSS.escape(focused)}"]`)
      ?.focus({ preventScroll: true });
}

function setView(next) {
  if (next === "notes") next = "lab";
  view = next;
  const [name, title, subtitle] = viewInfo[next];
  $("view-name").textContent = name;
  $("page-title").textContent = title;
  $("page-subtitle").textContent = subtitle;
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === next);
    if (b.dataset.view === next) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("overview-grid").hidden = ["lab", "archives"].includes(next);
  $("overview-grid").classList.toggle("single-column", next !== "overview");
  $("learning-workspace").hidden = !["overview", "learning"].includes(next);
  $("right-column").hidden = !["overview", "tasks"].includes(next);
  $("tasks-panel").hidden = !["overview", "tasks"].includes(next);
  $("lab-grid").hidden = next !== "lab";
  $("notes-panel").hidden = next !== "lab";
  render();
}

function fillDirections(select) {
  select.append(new Option("暂不关联", ""));
  DIRECTIONS.forEach((d) => select.append(new Option(d.name, d.id)));
}
fillDirections($("note-direction"));
fillDirections($("record-direction"));
for (const d of DIRECTIONS) {
  const side = el("button"),
    dot = el("span", "dot");
  dot.style.setProperty("--direction", d.color);
  side.append(dot, document.createTextNode(d.name));
  const strip = el("button");
  strip.style.setProperty("--direction", d.color);
  strip.append(icon(d.icon), document.createTextNode(d.name));
  for (const b of [side, strip]) {
    b.dataset.direction = d.id;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      direction = direction === d.id ? "" : d.id;
      strategy?.clearGoal();
      $("note-direction").value = direction;
      render();
    });
  }
  $("direction-nav").append(side);
  $("direction-strip").append(strip);
}

function confirmAction(title, description, accept = "确认") {
  $("confirm-heading").textContent = title;
  $("confirm-description").textContent = description;
  $("confirm-accept").textContent = accept;
  return new Promise((resolve) => {
    const dialog = $("confirm-dialog");
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "accept"),
      { once: true },
    );
    dialog.returnValue = "";
    dialog.showModal();
    $("confirm-cancel").focus();
  });
}
$("confirm-accept").addEventListener("click", () =>
  $("confirm-dialog").close("accept"),
);
$("confirm-cancel").addEventListener("click", () =>
  $("confirm-dialog").close("cancel"),
);
function download(text, name, type = "application/json;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportWorkspace() {
  try {
    const date = new Date().toLocaleDateString("sv-SE");
    download(serializeBackup(state), `战略工作台-${date}.json`);
    toast("工作区备份已导出");
  } catch (error) {
    toast("导出失败：" + error.message);
  }
}
function openSettings() {
  $("settings-message").textContent = "";
  updateStorageStatus();
  backupUI?.render();
  $("settings-dialog").showModal();
}
function settingsMessage(text, error = false) {
  $("settings-message").textContent = text;
  $("settings-message").classList.toggle("error", error);
}
[
  "settings-button",
  "sidebar-settings",
  "alert-settings",
  "example-status",
].forEach((id) => $(id).addEventListener("click", openSettings));
["export-button", "footer-export"].forEach((id) =>
  $(id).addEventListener("click", exportWorkspace),
);
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files[0];
  $("import-file").value = "";
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw Error("备份文件不能超过 32 MiB");
    await restoreWorkspace(parseBackup(await file.text()));
  } catch (error) {
    settingsMessage(
      "无法恢复：" + error.message + "。当前记录没有被替换。",
      true,
    );
  }
});
$("clear-examples").addEventListener("click", async () => {
  if (
    !(await confirmAction(
      "清除示例内容？",
      "只删除仍标记为示例的内容。你新增或修改的记录，以及常用网站都会保留。",
      "清除示例",
    ))
  )
    return;
  if (await commit((s) => Object.assign(s, removeExamples(s))))
    settingsMessage("示例已清除，你自己的记录已保留。");
});
$("export-raw").addEventListener("click", () => {
  if (corruptRaw !== null)
    download(
      corruptRaw,
      "战略工作台-待恢复原始记录.txt",
      "text/plain;charset=utf-8",
    );
});
$("reset-workspace").addEventListener("click", async () => {
  if (corruptRaw === null) return;
  const expected = corruptRaw;
  if (
    !(await confirmAction(
      "重新建立工作区？",
      "这会替换读取异常的原始数据。请先点击“下载原始数据”，保留恢复机会。",
      "确认重建",
    ))
  )
    return;
  try {
    const fresh = createWorkspace(false);
    savedSnapshot = await store.update((current) => {
      if (current !== expected)
        throw Error("工作区已有变化，请重新读取后再决定是否重建。");
      return serializeBackup(fresh);
    });
    volatileChanges = false;
    state = fresh;
    corruptRaw = null;
    storageStatus = "saved";
    render();
    settingsMessage("已建立空白工作区。");
  } catch (error) {
    settingsMessage(
      error.message || "浏览器仍无法保存，原始数据未被替换。",
      true,
    );
  }
});

document
  .querySelectorAll("[data-tool]")
  .forEach((b) => b.addEventListener("click", () => openTool(b.dataset.tool)));
document
  .querySelectorAll("[data-new]")
  .forEach((b) => b.addEventListener("click", () => openRecord(b.dataset.new)));
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => $(b.dataset.close).close()),
  );
document
  .querySelectorAll("[data-view]")
  .forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("open-lab").addEventListener("click", () => setView("lab"));
$("quick-add").addEventListener("click", () =>
  openRecord({ learning: "projects", lab: "experiments" }[view] || "tasks"),
);

$("task-filter").addEventListener("change", render);
$("global-search").addEventListener("input", () => {
  query = $("global-search").value.trim().toLocaleLowerCase();
  render();
});
$("clear-filters").addEventListener("click", () => {
  strategy.clearGoal();
  query = "";
  direction = "";
  $("global-search").value = "";
  $("note-direction").value = "";
  render();
});
$("task-quick").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("task-text").value.trim();
  if (!title) {
    toast("先写下想做的一件事。");
    return;
  }
  if (
    await commit((s) =>
      s.tasks.unshift({
        id: uid(),
        title,
        direction,
        done: false,
        demo: false,
        createdAt: new Date().toISOString(),
      }),
    )
  ) {
    $("task-text").value = "";
    $("task-filter").value = "pending";
    render();
  }
});
$("note-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = $("note-text").value.trim();
  if (!body) {
    toast("先写下一点内容。");
    return;
  }
  const noteDirection = $("note-direction").value;
  if (
    await commit((s) =>
      s.notes.unshift({
        id: uid(),
        body,
        direction: noteDirection,
        createdAt: new Date().toISOString(),
        demo: false,
      }),
    )
  ) {
    $("note-text").value = "";
    if (direction && noteDirection !== direction) direction = "";
    query = "";
    $("global-search").value = "";
    render();
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    ) &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    $("global-search").focus();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (storageStatus === "unavailable" || pendingWrites > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});
strategy = initStrategy({
  confirm: confirmAction,
  state: () => state,
  refresh: refreshForPreview,
  error: () => $("toast").textContent,
  direction: () => direction,
  query: () => query,
  view: () => view,
  matches,
  el,
  icon,
  commit,
  toast,
  openRecord,
  render,
  setView,
});
recordEditor = initRecordEditor({
  el,
  icon,
  commit,
  toast,
  error: () => $("toast").textContent,
  confirm: confirmAction,
  state: () => state,
  strategy: () => strategy,
  direction: () => direction,
  storageStatus: () => storageStatus,
  afterSave: (kind, item) => {
    if (direction && item.direction !== direction && kind !== "sites")
      direction = "";
    query = "";
    $("global-search").value = "";
    if (["experiments", "notes"].includes(kind)) setView("lab");
    else if (view !== "overview")
      setView(
        {
          tasks: "tasks",
          projects: "learning",
          plans: "learning",
          notes: "lab",
          sites: view,
        }[kind],
      );
    render();
  },
});
workspaceViews = initWorkspaceViews({
  el,
  icon,
  commit,
  openRecord,
  matches,
  setView,
  state: () => state,
  strategy: () => strategy,
  query: () => query,
  direction: () => direction,
  view: () => view,
  learningMode: () => strategy.learningMode(),
});
tools = initTools({ el, icon, toast });
backupUI = await initBackupSettings({
  el,
  store,
  state: () => state,
  restore: restoreWorkspace,
  confirm: confirmAction,
});
initLayout({ render });
initAbout({ el });
setView("overview");
document.documentElement.dataset.ready = "true";
backupUI.schedule();
// A private standalone preview may supply a local update package; it still requires preview confirmation.
const previewPacket = document.getElementById("private-preview-data");
if (previewPacket) strategy.importUpdate(JSON.parse(previewPacket.textContent));
