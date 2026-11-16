import { safeUrl, validateWorkspace } from "#workbench/workspace";
import { stable, removeRecord } from "#workbench/strategy";
const $ = (id) => document.getElementById(id);
export function initRecordEditor(ctx) {
  const { el, icon, commit, toast } = ctx;
  const confirmAction = ctx.confirm;
  const uid = () => crypto.randomUUID();
  let editing = null,
    creationSeed = {};
  const movableFields = ["direction-field", "steps-field"].map((id) => {
    const node = $(id),
      anchor = document.createComment(id);
    node.before(anchor);
    return { node, anchor };
  });
  function updateRecordFields() {
    for (const { node, anchor } of movableFields) anchor.after(node);
    const kind = $("record-kind").value;
    $("record-heading").textContent =
      (editing ? "编辑" : "新建") +
      {
        tasks: "任务",
        projects: "项目",
        plans: "方案资料",
        notes: "随手记",
        sites: "常用网站",
        experiments: "实验",
      }[kind];
    $("title-field").hidden = kind === "notes";
    $("record-title").required = kind !== "notes";
    $("record-title").maxLength = kind === "sites" ? 80 : 300;
    $("title-field").firstChild.textContent =
      kind === "projects" ? "项目名称" : "名称";
    $("record-title").placeholder =
      kind === "projects"
        ? "例如：完成一个可运行的技术原型"
        : "想学什么，或想做什么？";
    $("body-field").hidden = !["notes", "experiments"].includes(kind);
    $("record-body").required = kind === "notes";
    $("direction-field").hidden = kind === "sites";
    $("due-field").hidden = !["tasks", "plans"].includes(kind);
    $("steps-field").hidden = kind !== "projects" || !!editing;
    $("status-field").hidden = !["tasks", "experiments"].includes(kind);
    $("url-field").hidden = !["sites", "experiments"].includes(kind);
    $("record-url").required = kind === "sites";
    $("url-hint").textContent =
      kind === "experiments"
        ? "可不填，完成后再补上工具链接"
        : "使用 https:// 或 http:// 地址";
    $("record-status").replaceChildren();
    const options =
      kind === "plans"
        ? [
            ["next", "准备开始"],
            ["active", "正在推进"],
            ["done", "回顾与沉淀"],
          ]
        : kind === "tasks"
          ? [
              ["pending", "待完成"],
              ["done", "已完成"],
            ]
          : [
              ["idea", "构想中"],
              ["building", "开发中"],
              ["ready", "已完成"],
            ];
    options.forEach(([value, label]) =>
      $("record-status").append(new Option(label, value)),
    );
    $("record-error").hidden = true;
    ctx
      .strategy()
      ?.fillEditor(
        kind,
        editing
          ? ctx.state()[kind].find((x) => x.id === editing.id)
          : creationSeed,
      );
    const more = $("record-project-more-content");
    if (more) more.prepend(...movableFields.map(({ node }) => node));
  }

  function openRecord(kind = "tasks", id = null, seed = {}, options = {}) {
    creationSeed = seed;
    if (["goals", "archives"].includes(kind))
      return ctx.strategy().edit(kind, id);
    const item = id ? ctx.state()[kind].find((x) => x.id === id) : null;
    if (id && !item) return;
    editing = item ? { kind, id, original: recordSignature(item) } : null;
    $("record-form").reset();
    $("record-kind").value = kind;
    $("kind-field").hidden =
      !!editing || (kind === "projects" && !options.typePicker);
    updateRecordFields();
    $("record-title").value = item?.title || item?.name || seed.title || "";
    $("record-direction").value =
      item?.direction ?? seed.direction ?? ctx.direction();
    if (kind === "projects" && !editing)
      $("record-goals").dispatchEvent(new Event("change"));
    $("record-body").value = item?.body || item?.description || "";
    $("record-steps").value = "";
    $("record-due").value = item?.dueDate || "";
    $("record-url").value = item?.url || "";
    if (item)
      $("record-status").value =
        kind === "tasks" ? (item.done ? "done" : "pending") : item.status || "";
    $("record-delete").hidden = !editing;
    $("record-dialog").showModal();
    (kind === "notes" ? $("record-body") : $("record-title")).focus();
  }

  function preserveSteps(text, old = []) {
    const byTitle = new Map();
    for (const step of old) {
      if (!byTitle.has(step.title)) byTitle.set(step.title, []);
      byTitle.get(step.title).push(step);
    }
    return text
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map(
        (title) =>
          byTitle.get(title)?.shift() || { id: uid(), title, done: false },
      );
  }

  function recordSignature(item) {
    return stable(item);
  }

  let saving = false;
  $("record-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    $("record-submit").disabled = true;
    const target = editing ? { ...editing } : null;
    const kind = target?.kind || $("record-kind").value;
    const previous = editing
      ? ctx.state()[kind].find((x) => x.id === editing.id)
      : null;
    const title = $("record-title").value.trim();
    const item = { ...creationSeed, ...previous, id: previous?.id || uid() };
    try {
      if (kind === "sites") {
        item.name = title;
        item.url = safeUrl($("record-url").value);
        if (!item.url)
          throw new Error(
            "请输入有效的 HTTP(S) 网址，地址中不能包含用户名或密码。",
          );
      } else {
        item.direction = $("record-direction").value;
        item.createdAt = previous?.createdAt || new Date().toISOString();
        item.demo = false;
        if (kind === "notes") item.body = $("record-body").value.trim();
        else item.title = title;
        if (["tasks", "plans"].includes(kind)) {
          delete item.dueDate;
          if ($("record-due").value) item.dueDate = $("record-due").value;
        }
        if (kind === "tasks") item.done = $("record-status").value === "done";
        if (kind === "projects" && !previous)
          item.steps = preserveSteps($("record-steps").value);
        if (kind === "plans") item.status = previous?.status || "next";
        if (kind === "experiments") {
          item.description = $("record-body").value.trim();
          item.status = $("record-status").value;
          item.url = $("record-url").value.trim()
            ? safeUrl($("record-url").value)
            : "";
          if (item.url === null)
            throw new Error("实验链接需要有效的 HTTP(S) 地址。");
        }
      }
      ctx.strategy().readEditor(kind, item);
      const candidate = structuredClone(ctx.state());
      if (previous)
        candidate[kind] = candidate[kind].map((x) =>
          x.id === previous.id ? item : x,
        );
      else candidate[kind].unshift(item);
      validateWorkspace(candidate);
      if (
        !(await commit((s) => {
          if (target) {
            const index = s[kind].findIndex((x) => x.id === target.id);
            if (
              index < 0 ||
              recordSignature(s[kind][index]) !== target.original
            ) {
              throw new Error(
                "这条记录已在其他标签页修改或删除。当前输入已保留，请复制后重新打开最新记录。",
              );
            }
            s[kind][index] = item;
          } else {
            s[kind].unshift(item);
          }
        }))
      ) {
        $("record-error").textContent = ctx.error();
        $("record-error").hidden = false;
        return;
      }
      ctx.afterSave(kind, item);
      $("record-dialog").close();
      if (ctx.storageStatus() !== "unavailable")
        toast(previous ? "记录已更新" : "已放进你的工作区");
    } catch (error) {
      $("record-error").textContent = error.message;
      $("record-error").hidden = false;
    } finally {
      saving = false;
      $("record-submit").disabled = false;
    }
  });

  $("record-delete").addEventListener("click", async () => {
    if (!editing) return;
    const target = { ...editing };
    if (
      !(await confirmAction(
        "删除这条记录？",
        "仅删除所选记录，保留关联的任务、资料和学习记录并解除关联。删除后可从备份恢复。",
        "删除",
      ))
    )
      return;
    if (
      await commit(
        (s) => {
          const current = s[target.kind].find((x) => x.id === target.id);
          if (!current || recordSignature(current) !== target.original)
            throw Error("记录已有变化，请重新打开后确认删除。");
          removeRecord(s, target.kind, target.id);
        },
        { requirePersistence: true },
      )
    ) {
      $("record-dialog").close();
      toast("记录已删除");
    } else {
      $("record-error").textContent =
        "删除未保存，记录已保留。" + (ctx.error() || "");
      $("record-error").hidden = false;
    }
  });

  $("record-kind").addEventListener("change", updateRecordFields);
  return { open: openRecord };
}
