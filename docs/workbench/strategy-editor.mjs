import { DIRECTIONS, safeUrl } from "#workbench/workspace";
import { stable } from "#workbench/strategy";
import { parentOf, PARENT_TYPES } from "#workbench/hierarchy";
import {
  executionNames,
  adoptionNames,
  kindNames,
  archiveNames,
  labels,
} from "#workbench/strategy-common";
const $ = (id) => document.getElementById(id);
export function initStrategyEditor(ctx, common, selectGoal) {
  const {
    el,
    icon,
    commit,
    toast,
    openRecord,
    state,
    button,
    badge,
    description,
    tags,
    titleOf,
    field,
    display,
  } = common;
  let editor = null;
  function sourceEvidence(root, r) {
    const sources = new Set(
      [r.sourceId, ...(r.sourceRefs || []).map((ref) => ref.sourceId)].filter(
        Boolean,
      ),
    );
    for (const id of sources) {
      const source = state().sources.find((s) => s.id === id);
      if (!source) continue;
      const section = el("section", "detail-block evidence-block");
      section.append(el("h3", null, "来源 · " + source.title));
      for (const [field, label] of [
        ["conversationUrl", "回到原对话"],
        ["shareUrl", "查看分享记录"],
      ])
        if (safeUrl(source[field])) {
          const a = el("a", "button small", label);
          a.href = safeUrl(source[field]);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          section.append(a);
        }
      for (const ref of (r.sourceRefs || []).filter(
        (ref) => ref.sourceId === id,
      )) {
        const kind = {
          intent: "用户意图",
          suggestion: "AI 建议",
          evidence: "记录证据",
          preference: "用户规则",
        }[ref.kind];
        description(section, kind, ref.excerpt);
        if (ref.messageId)
          section.append(el("small", "message-id", "消息 " + ref.messageId));
      }
      root.append(section);
    }
  }
  function detail(collection, id) {
    const r = state()[collection].find((r) => r.id === id);
    if (!r) return;
    editor = null;
    const root = dialogBody(r.title);
    root.append(tags(r));
    const parent = parentOf(collection, r);
    if (parent)
      root.append(
        button(
          "归属：" + titleOf(parent.collection, parent.id),
          () => {
            if (parent.collection === "goals") {
              close();
              selectGoal(parent.id);
            } else detail(parent.collection, parent.id);
          },
          "relation-link",
        ),
      );
    if (collection === "archives") {
      root.append(badge(archiveNames[r.status]));
      for (const [key, label] of [
        ["question", "题目 / 问题"],
        ["answer", "我的回答"],
        ["feedback", "AI 点评"],
        ["score", "本题评分（仅对应这次练习）"],
        ["blindSpots", "盲区与待核实"],
        ["excerpt", "关键信息总结"],
        ["nextQuestion", "下一问题"],
        ["nextAction", "下一步"],
      ])
        description(root, label, r[key]);
      root.append(
        el(
          "p",
          "section-description",
          r.sourceTime
            ? "原始时间：" + new Date(r.sourceTime).toLocaleString("zh-CN")
            : "原始时间未知",
        ),
      );
      if (r.capturedAt)
        root.append(
          el(
            "small",
            null,
            "归档时间：" + new Date(r.capturedAt).toLocaleString("zh-CN"),
          ),
        );
      if (r.question || r.nextQuestion)
        root.append(
          button("复制待续问题", async () => {
            try {
              await navigator.clipboard.writeText(r.nextQuestion || r.question);
              toast("已复制，可以回 ChatGPT 继续。");
            } catch {
              toast("复制失败，请直接选择问题文字复制。");
            }
          }),
        );
      root.append(button("编辑归档", () => edit(collection, id)));
    } else {
      root.append(
        badge(adoptionNames[r.adoption]),
        badge(executionNames[r.execution]),
      );
      for (const [key, label] of [
        ["summary", "概述"],
        ["nextStep", "下一步"],
        ["practiceRule", "跟进规则"],
        ["acceptance", "验收与交付"],
      ])
        description(root, label, r[key]);
      for (const gid of r.goalIds)
        root.append(
          button(
            "支撑目标：" + titleOf("goals", gid),
            () => {
              close();
              selectGoal(gid);
            },
            "goal-chip",
          ),
        );
      for (const rel of r.relations || [])
        root.append(
          button(
            {
              related: "相关事项",
              method: "采用方法",
              research: "相关研究",
              depends: rel.confirmed ? "已确认前置依赖" : "候选前置依赖",
            }[rel.type] +
              "：" +
              titleOf("projects", rel.targetId),
            () => detail("projects", rel.targetId),
            "relation-link",
          ),
        );
      const plans = state().plans.filter((p) => p.itemIds.includes(r.id));
      for (const p of plans)
        root.append(
          button(
            "计划：" + p.title + " · " + adoptionNames[p.adoption],
            () => detail("plans", p.id),
            "relation-link",
          ),
        );
      const archives = state().archives.filter((a) => a.projectId === id);
      for (const a of archives)
        root.append(
          button(
            "学习记录：" + a.title + " · " + archiveNames[a.status],
            () => detail("archives", a.id),
            "relation-link",
          ),
        );
      const notes = state().notes.filter((n) => n.itemIds.includes(id));
      for (const note of notes) description(root, "关联随手记", note.body);
      const tasks = state().tasks.filter((t) => t.itemIds.includes(id));
      for (const task of tasks)
        root.append(
          button(
            (task.done ? "已完成：" : "待办：") + task.title,
            () => {
              close();
              openRecord("tasks", task.id);
            },
            "relation-link",
          ),
        );
      root.append(
        button("编辑事项", () => {
          close();
          openRecord(collection, id);
        }),
      );
    }
    sourceEvidence(root, r);
    const revs = state().revisions.filter(
      (v) =>
        (v.collection === collection && v.id === id) ||
        (v.collection === "sources" && v.id === r.sourceId),
    );
    if (revs.length) {
      const details = el("details", "revision-history");
      details.append(el("summary", null, `修订记录 · ${revs.length} 次`));
      for (const rev of revs.slice().reverse()) {
        const block = el("div", "revision-row");
        block.append(
          el(
            "small",
            null,
            (rev.at ? new Date(rev.at).toLocaleString("zh-CN") : "时间未知") +
              " · " +
              rev.kind,
          ),
        );
        for (const [key, value] of Object.entries(rev.fields))
          description(
            block,
            labels[key] || key,
            display(value.before) + " → " + display(value.after),
          );
        details.append(block);
      }
      root.append(details);
    }
    show();
  }

  // Dynamic forms use text nodes for all imported/user content.
  const dialog = el("dialog", "dialog strategy-dialog");
  dialog.id = "strategy-dialog";
  dialog.setAttribute("aria-labelledby", "strategy-heading");
  document.body.append(dialog);
  function close() {
    dialog.close();
  }
  function dialogBody(title) {
    dialog.replaceChildren();
    const head = el("div", "dialog-header"),
      h = el("h2", null, title);
    h.id = "strategy-heading";
    const b = button("×", close, "icon-button");
    b.setAttribute("aria-label", "关闭详情窗口");
    head.append(h, b);
    const body = el("div", "strategy-detail-body");
    dialog.append(head, body);
    return body;
  }
  function show() {
    if (!dialog.open) dialog.showModal();
  }

  function parentField(root, collection, record, id) {
    const value = record?.parentRef
      ? record.parentRef.collection + ":" + record.parentRef.id
      : "";
    const options = [["", "自动归属（按已有目标或事项关联）"]];
    for (const c of PARENT_TYPES[collection])
      for (const r of state()[c])
        if (!(c === collection && r.id === record?.id))
          options.push([
            c + ":" + r.id,
            { goals: "目标", projects: "事项", plans: "计划" }[c] +
              " · " +
              r.title,
          ]);
    field(root, "归属位置", "" + id, value, "select", options);
    root.append(
      el("p", "field-hint", "归属决定树中的位置，不改变采纳状态和执行进度。"),
    );
  }
  function readParent(value) {
    if (!value) return null;
    const i = value.indexOf(":");
    return { collection: value.slice(0, i), id: value.slice(i + 1) };
  }
  function checkboxGroup(root, label, id, options, selected) {
    const group = el("fieldset", "association-field");
    group.id = id;
    group.append(el("legend", null, label));
    for (const [value, title] of options) {
      const wrap = el("label"),
        check = el("input");
      check.type = "checkbox";
      check.value = value;
      check.checked = (selected || []).includes(value);
      wrap.append(check, document.createTextNode(title));
      group.append(wrap);
    }
    root.append(group);
  }
  const checked = (id) =>
    Array.from($(id)?.querySelectorAll("input:checked") || [], (i) => i.value);
  function edit(collection, id = null) {
    const existing = id ? state()[collection].find((r) => r.id === id) : null;
    if (id && !existing) return;
    editor = {
      collection,
      id,
      original: existing ? stable(existing) : null,
      sourceOriginal: existing?.sourceId
        ? structuredClone(
            state().sources.find((s) => s.id === existing.sourceId),
          )
        : null,
    };
    const root = dialogBody(
      (existing ? "编辑" : "新建") +
        (collection === "goals" ? "长期目标" : "学习归档"),
    );
    const form = el("form");
    root.append(form);
    const title = field(form, "名称", "strategy-title", existing?.title || "");
    title.required = true;
    if (collection === "goals") {
      field(
        form,
        "为什么重要 / 想实现什么",
        "strategy-why",
        existing?.why || "",
        "textarea",
      );
      checkboxGroup(
        form,
        "关联方向",
        "strategy-directions",
        DIRECTIONS.map((d) => [d.id, d.name]),
        existing?.directionIds || [ctx.direction()].filter(Boolean),
      );
      field(
        form,
        "关注状态",
        "strategy-goal-status",
        existing?.status || "active",
        "select",
        [
          ["active", "持续关注"],
          ["paused", "暂停关注"],
          ["archived", "已归档"],
        ],
      );
    } else {
      field(
        form,
        "关联事项",
        "strategy-project",
        existing?.projectId || "",
        "select",
        [["", "暂不关联"], ...state().projects.map((p) => [p.id, p.title])],
      );
      for (const [key, label] of [
        ["question", "题目 / 问题"],
        ["answer", "我的回答"],
        ["feedback", "AI 点评"],
        ["score", "本题评分（可不填）"],
        ["blindSpots", "盲区与待核实"],
        ["excerpt", "关键信息总结"],
        ["nextQuestion", "下一问题"],
        ["nextAction", "下一步"],
      ])
        field(
          form,
          label,
          "strategy-" + key,
          existing?.[key] || "",
          key === "score" ? "input" : "textarea",
        );
      field(
        form,
        "分享链接",
        "strategy-share",
        state().sources.find((s) => s.id === existing?.sourceId)?.shareUrl ||
          "",
      );
      $("strategy-share").maxLength = 2000;
      field(
        form,
        "原对话链接（可不填）",
        "strategy-conversation",
        state().sources.find((s) => s.id === existing?.sourceId)
          ?.conversationUrl || "",
      );
      $("strategy-conversation").maxLength = 2000;
      parentField(form, "archives", existing, "strategy-parent");
    }
    const error = el("p", "form-error");
    error.role = "alert";
    form.append(error);
    const actions = el("div", "dialog-actions"),
      save = el("button", "button primary", "保存");
    save.id = "strategy-save";
    actions.append(button("取消", close), save);
    form.append(actions);
    let saving = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      save.disabled = true;
      const values = Object.fromEntries(
        Array.from(form.querySelectorAll("input,textarea,select"), (input) => [
          input.id,
          input.value,
        ]),
      );
      const selectedDirections = checked("strategy-directions");
      try {
        const target = { ...editor };
        if (
          await commit((s) => {
            const current = target.id
              ? s[collection].find((r) => r.id === target.id)
              : null;
            if (target.id && (!current || stable(current) !== target.original))
              throw Error("记录已变化，请复制输入后重新打开。");
            const item = {
              ...current,
              id: current?.id || crypto.randomUUID(),
              title: values["strategy-title"].trim(),
              demo: false,
            };
            if (collection === "goals") {
              item.why = values["strategy-why"].trim();
              item.directionIds = selectedDirections;
              item.status = values["strategy-goal-status"];
              item.confirmed = true;
              item.origin = "user";
            } else {
              const parent = readParent(values["strategy-parent"]);
              if (stable(item.parentRef ?? null) !== stable(parent))
                item.parentCustomized = true;
              item.parentRef = parent;
              item.projectId = values["strategy-project"];
              const project = s.projects.find((p) => p.id === item.projectId);
              item.goalIds = project?.goalIds || [];
              item.directionIds = project?.directionIds || [];
              for (const key of [
                "question",
                "answer",
                "feedback",
                "score",
                "blindSpots",
                "excerpt",
                "nextQuestion",
                "nextAction",
              ])
                item[key] = values["strategy-" + key].trim();
              item.status = !item.answer
                ? item.question
                  ? "waiting_answer"
                  : "verify"
                : !item.feedback
                  ? "waiting_feedback"
                  : "recorded";
              item.capturedAt = current?.capturedAt || new Date().toISOString();
              const share = values["strategy-share"].trim(),
                conversation = values["strategy-conversation"].trim();
              if (
                (share && !safeUrl(share)) ||
                (conversation && !safeUrl(conversation))
              )
                throw Error("来源链接需要有效的 HTTP(S) 地址");
              if (share || conversation || current?.sourceId) {
                const sourceId = current?.sourceId || crypto.randomUUID(),
                  source = s.sources.find((r) => r.id === sourceId);
                if (source) {
                  for (const [key, value] of [
                    ["shareUrl", share],
                    ["conversationUrl", conversation],
                  ]) {
                    const original = target.sourceOriginal?.[key] || "";
                    // An untouched input must not revert another archive's shared source.
                    if (value === original) continue;
                    if (source[key] !== original && source[key] !== value)
                      throw Error(
                        "来源链接已在其他标签页修改。输入已保留，请复制后重新打开最新记录。",
                      );
                    source[key] = value;
                  }
                } else
                  s.sources.push({
                    id: sourceId,
                    title: item.title,
                    shareUrl: share,
                    conversationUrl: conversation,
                    origin: "user",
                  });
                item.sourceId = sourceId;
              }
            }
            if (current)
              s[collection][s[collection].findIndex((r) => r.id === item.id)] =
                item;
            else s[collection].unshift(item);
          })
        ) {
          if (dialog.contains(form)) close();
          ctx.render();
        } else error.textContent = ctx.error() || "未保存，输入已保留。";
      } finally {
        saving = false;
        save.disabled = false;
      }
    });
    show();
    title.focus();
  }
  // Extra fields extend the legacy quick-record form, preserving its existing step editing.
  const extra = el("div", "strategy-editor-extra");
  extra.id = "strategy-editor-extra";
  $("record-form").insertBefore(extra, $("record-error"));
  function fillEditor(kind, r) {
    extra.replaceChildren();
    extra.hidden = kind === "sites";
    if (extra.hidden) return;
    checkboxGroup(
      extra,
      "关联目标（可多选）",
      "record-goals",
      state().goals.map((g) => [g.id, g.title]),
      r?.goalIds,
    );
    if (kind !== "projects")
      checkboxGroup(
        extra,
        "关联事项（可多选）",
        "record-items",
        state().projects.map((p) => [p.id, p.title]),
        r?.itemIds,
      );
    if (["projects", "plans"].includes(kind)) {
      parentField(extra, kind, r, "record-parent");
      if (kind === "projects")
        field(
          extra,
          "事项类型",
          "record-item-kind",
          r?.kind || "learning",
          "select",
          Object.entries(kindNames),
        );
      checkboxGroup(
        extra,
        "更多关联方向",
        "record-directions",
        DIRECTIONS.map((d) => [d.id, d.name]),
        r?.directionIds,
      );
      field(extra, "概述", "record-summary", r?.summary || "", "textarea");
      field(extra, "下一步", "record-next-step", r?.nextStep || "", "textarea");
      field(
        extra,
        "采纳状态",
        "record-adoption",
        r?.adoption || "adopted",
        "select",
        Object.entries(adoptionNames),
      );
      if (kind === "projects") {
        field(
          extra,
          "执行状态",
          "record-execution",
          r?.execution || "unknown",
          "select",
          Object.entries(executionNames),
        );
        field(
          extra,
          "跟进规则",
          "record-rule",
          r?.practiceRule || "",
          "textarea",
        );
        field(
          extra,
          "验收与交付",
          "record-acceptance",
          r?.acceptance || "",
          "textarea",
        );
        const rel = el("div", "relation-editor");
        rel.id = "record-relations";
        rel.append(el("p", "field-hint", "事项关系 · 前置依赖需由你确认"));
        for (const p of state().projects.filter((p) => p.id !== r?.id)) {
          const row = el("div", "relation-editor-row");
          const old = r?.relations?.find((link) => link.targetId === p.id);
          const select = field(
            row,
            p.title,
            "relation-" + p.id,
            old?.type || "",
            "select",
            [
              ["", "无关联"],
              ["related", "相关事项"],
              ["method", "采用方法"],
              ["research", "相关研究"],
              ["depends", "前置依赖"],
            ],
          );
          select.dataset.target = p.id;
          const label = el("label"),
            check = el("input");
          check.type = "checkbox";
          check.checked = old?.confirmed || false;
          check.dataset.confirm = p.id;
          label.append(check, document.createTextNode("确认关系"));
          row.append(label);
          rel.append(row);
        }
        extra.append(rel);
      }
    }
  }
  function readEditor(kind, item) {
    if (kind === "sites") return item;
    item.goalIds = checked("record-goals");
    if (kind !== "projects") item.itemIds = checked("record-items");
    if (["projects", "plans"].includes(kind)) {
      const parent = readParent($("record-parent").value);
      if (stable(item.parentRef ?? null) !== stable(parent))
        item.parentCustomized = true;
      item.parentRef = parent;
      item.directionIds = Array.from(
        new Set(
          [item.direction, ...checked("record-directions")].filter(Boolean),
        ),
      );
      item.summary = $("record-summary").value.trim();
      item.nextStep = $("record-next-step").value.trim();
      item.adoption = $("record-adoption").value;
      if (kind === "projects") {
        item.kind = $("record-item-kind").value;
        item.execution = $("record-execution").value;
        item.practiceRule = $("record-rule").value.trim();
        item.acceptance = $("record-acceptance").value.trim();
        item.relations = Array.from(
          $("record-relations").querySelectorAll("select[data-target]"),
        )
          .filter((s) => s.value)
          .map((s) => ({
            targetId: s.dataset.target,
            type: s.value,
            confirmed: Array.from(
              $("record-relations").querySelectorAll("input[data-confirm]"),
            ).find((c) => c.dataset.confirm === s.dataset.target).checked,
          }));
      } else {
        const previous = state().plans.find((p) => p.id === item.id);
        item.execution =
          previous && previous.status === item.status
            ? previous.execution
            : { next: "not_started", active: "active", done: "completed" }[
                item.status
              ];
      }
    } else item.directionIds = item.direction ? [item.direction] : [];
    return item;
  }

  return { edit, detail, fillEditor, readEditor };
}
