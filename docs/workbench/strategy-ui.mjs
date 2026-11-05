import { DIRECTIONS, safeUrl } from "./workspace.mjs?v=20261105-strategy2";
import {
  prepareUpdate,
  applyUpdate,
  parseUpdate,
  stable,
} from "./strategy.mjs?v=20261105-strategy2";

const executionNames = {
  unknown: "进度待确认",
  not_started: "未开始",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};
const adoptionNames = {
  candidate: "建议待确认",
  adopted: "已采纳",
  deferred: "暂缓",
  rejected: "不采用",
};
const kindNames = {
  project: "实践项目",
  learning: "持续学习",
  research: "专题研究",
  method: "共通方法",
  idea: "探索想法",
};
const archiveNames = {
  waiting_answer: "待回答",
  waiting_feedback: "待点评",
  recorded: "已归档",
  verify: "待验证",
};
const labels = {
  title: "名称",
  summary: "概述",
  nextStep: "下一步",
  execution: "执行状态",
  adoption: "采纳状态",
  directionIds: "关联方向",
  goalIds: "关联目标",
  itemIds: "关联事项",
  answer: "用户回答",
  question: "题目",
  feedback: "AI 点评",
  sourceRefs: "来源依据",
  sourceTime: "原始时间",
  capturedAt: "归档时间",
  steps: "步骤",
  status: "记录状态",
  relations: "事项关系",
  origin: "内容来源",
  practiceRule: "跟进规则",
  acceptance: "验收要求",
  why: "目标原因",
  confirmed: "目标确认",
  nextAction: "下一步",
  nextQuestion: "下一问题",
  blindSpots: "盲区",
  score: "本题评分",
  excerpt: "关键摘录",
  shareUrl: "分享链接",
  conversationUrl: "原对话链接",
};
const $ = (id) => document.getElementById(id);
export function initStrategy(ctx) {
  const { el, icon, commit, toast, openRecord } = ctx;
  let goalId = "",
    preview = null,
    packet = null,
    mappings = {},
    editor = null;
  const state = () => ctx.state();
  const button = (label, fn, cls = "button small") => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  };
  const badge = (text, cls = "") => el("span", "strategy-badge " + cls, text);
  function description(parent, label, value) {
    if (!value) return;
    const section = el("section", "detail-block");
    section.append(el("h3", null, label), el("p", null, value));
    parent.append(section);
  }
  function tags(record) {
    const wrap = el("div", "strategy-tags");
    for (const id of record.directionIds || []) {
      const d = DIRECTIONS.find((d) => d.id === id);
      if (d) {
        const t = badge(d.name);
        t.style.setProperty("--accent", d.color);
        wrap.append(t);
      }
    }
    return wrap;
  }
  function titleOf(collection, id) {
    return state()[collection].find((r) => r.id === id)?.title || id;
  }
  function goalMatches(item) {
    return (
      !goalId ||
      (item.goalIds || []).includes(goalId) ||
      (item.itemIds || []).some((id) =>
        state()
          .projects.find((p) => p.id === id)
          ?.goalIds.includes(goalId),
      ) ||
      (item.projectId &&
        state()
          .projects.find((p) => p.id === item.projectId)
          ?.goalIds.includes(goalId))
    );
  }
  function showGoals() {
    const root = $("goal-list");
    root.replaceChildren();
    const goals = state().goals.filter((g) => ctx.matches(g, false));
    $("goal-summary").textContent =
      `${state().goals.filter((g) => g.status === "active").length} 个长期目标`;
    if (!goals.length) {
      const empty = el("div", "strategy-empty");
      empty.append(
        el("p", null, "先写下你希望长期改善的事情。"),
        el("small", null, "健康、家庭教育等方向可以随时补充。"),
      );
      root.append(empty);
    }
    for (const g of goals) {
      const items = state().projects.filter(
        (p) => p.goalIds.includes(g.id) && !p.archived,
      );
      const card = el(
        "article",
        "goal-card" + (goalId === g.id ? " selected" : ""),
      );
      const color =
        DIRECTIONS.find((d) => d.id === g.directionIds[0])?.color || "#7ce8ee";
      card.style.setProperty("--accent", color);
      const top = el("div", "goal-card-top");
      top.append(
        tags(g),
        button("编辑", () => edit("goals", g.id), "subtle-link"),
      );
      const title = button(g.title, () => selectGoal(g.id), "goal-title");
      const meta = el("div", "goal-card-meta");
      meta.append(
        el(
          "span",
          null,
          `${items.length} 个事项 · ${items.filter((p) => p.execution === "active").length} 个进行中`,
        ),
        badge(
          g.demo
            ? "示例"
            : !g.confirmed
              ? "待确认"
              : { active: "持续关注", paused: "暂停关注", archived: "已归档" }[
                  g.status
                ],
        ),
      );
      card.append(
        top,
        title,
        el("p", "goal-why", g.why || "还没有填写为什么重要。"),
        meta,
        button("查看关联事项", () => selectGoal(g.id), "goal-open"),
      );
      root.append(card);
    }
    const context = $("goal-context");
    context.replaceChildren();
    context.hidden = !goalId;
    if (goalId) {
      context.append(
        el("span", null, "正在查看：" + titleOf("goals", goalId)),
        button(
          "查看全部目标",
          () => {
            goalId = "";
            ctx.render();
          },
          "subtle-link",
        ),
      );
    }
  }
  function selectGoal(id) {
    goalId = id;
    ctx.setView("learning");
    $("projects-list").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showContinuation() {
    const root = $("continuation-strip");
    root.replaceChildren();
    const rounds = state().archives.filter(
      (r) =>
        ctx.matches(r) &&
        ["waiting_answer", "waiting_feedback", "verify"].includes(r.status),
    );
    const heading = el("div", "continuation-heading");
    heading.append(
      icon("document"),
      el("span", null, "从上次继续"),
      el("small", null, `${rounds.length} 个断点`),
    );
    root.append(heading);
    if (!rounds.length)
      root.append(el("p", "muted", "新学习记录会在这里留下下一步。"));
    for (const r of rounds.slice(0, 3)) {
      const b = button(
        r.title,
        () => detail("archives", r.id),
        "continuation-item",
      );
      b.append(
        el(
          "small",
          null,
          archiveNames[r.status] +
            " · " +
            (r.nextAction || r.nextQuestion || r.question || "打开记录继续"),
        ),
      );
      root.append(b);
    }
    if (rounds.length > 3)
      root.append(
        button("全部 →", () => ctx.setView("archives"), "subtle-link"),
      );
  }
  function showProposals() {
    const root = $("proposal-workspace");
    root.replaceChildren();
    const entries = ["projects", "plans"].flatMap((collection) =>
      state()
        [collection].filter((r) => r.adoption !== "adopted" && ctx.matches(r))
        .map((r) => ({ collection, r })),
    );
    const heading = el("div", "section-heading proposal-heading");
    heading.append(
      el("h2", null, "想法与候选规划"),
      badge(`${entries.length} 项`),
    );
    root.append(heading);
    if (!entries.length) {
      root.append(
        el(
          "p",
          "section-description",
          "新的建议先留在这里，由你决定是否采纳。",
        ),
      );
      return;
    }
    const list = el("div", "proposal-list");
    for (const { collection, r } of ctx.view() === "overview"
      ? entries.slice(0, 3)
      : entries) {
      const card = el("article", "proposal-card");
      const title = button(
        r.title,
        () => detail(collection, r.id),
        "proposal-title",
      );
      card.append(
        title,
        badge(adoptionNames[r.adoption], "adoption-" + r.adoption),
        el("p", null, r.summary || "先确认是否采用，再决定何时开始。"),
      );
      const actions = el("div", "strategy-actions");
      for (const [value, label] of [
        ["adopted", "采纳"],
        ["deferred", "暂缓"],
        ["rejected", "不采用"],
      ])
        if (value !== r.adoption)
          actions.append(
            button(
              label,
              () =>
                commit((s) => {
                  const x = s[collection].find((x) => x.id === r.id);
                  x.adoption = value;
                  x.demo = false;
                }),
              value === "adopted" ? "button small" : "subtle-link",
            ),
          );
      card.append(actions);
      list.append(card);
    }
    root.append(list);
    if (ctx.view() === "overview" && entries.length > 3)
      root.append(
        button(
          `查看全部 ${entries.length} 项 →`,
          () => ctx.setView("learning"),
          "subtle-link more-strategy",
        ),
      );
  }
  function showArchives() {
    const root = $("archive-list");
    root.replaceChildren();
    const mode = $("archive-filter").value;
    if (mode === "history") {
      const completed = ["tasks", "projects", "plans"].flatMap((collection) =>
        state()
          [collection].filter(
            (r) =>
              ctx.matches(r) &&
              (r.done === true || r.execution === "completed"),
          )
          .map((r) => ({ collection, r })),
      );
      for (const { collection, r } of completed) {
        const row = el("article", "history-row");
        row.append(
          icon("check"),
          el("h3", null, r.title),
          badge("已完成"),
          button("查看", () =>
            collection === "tasks"
              ? openRecord(collection, r.id)
              : detail(collection, r.id),
          ),
        );
        root.append(row);
      }
      const steps = state()
        .projects.filter(ctx.matches)
        .flatMap((p) => p.steps.filter((s) => s.done).map((s) => ({ p, s })));
      for (const { p, s } of steps) {
        const row = el("article", "history-row");
        row.append(
          icon("check"),
          el("div", null, p.title + " / " + s.title),
          badge("步骤完成"),
          button("查看事项", () => detail("projects", p.id)),
        );
        root.append(row);
      }
    } else {
      const rounds = state().archives.filter(
        (r) =>
          ctx.matches(r) &&
          (mode === "all" ||
            (mode === "recorded"
              ? r.status === "recorded"
              : r.status !== "recorded")),
      );
      for (const r of rounds) {
        const card = el("article", "archive-card");
        const top = el("div", "archive-card-top");
        top.append(
          badge(archiveNames[r.status], "state-" + r.status),
          el("small", null, titleOf("projects", r.projectId) || "未关联事项"),
        );
        card.append(
          top,
          el("h3", null, r.title),
          el(
            "p",
            null,
            r.nextQuestion ||
              r.question ||
              r.excerpt ||
              r.feedback ||
              "尚未补充内容",
          ),
        );
        const bottom = el("div", "archive-card-bottom");
        bottom.append(
          el(
            "small",
            null,
            r.sourceTime
              ? new Date(r.sourceTime).toLocaleDateString("zh-CN")
              : "原始时间未知",
          ),
          button("查看记录", () => detail("archives", r.id)),
        );
        card.append(bottom);
        root.append(card);
      }
    }
    if (!root.childElementCount)
      root.append(
        el(
          "div",
          "strategy-empty",
          "这里还没有记录。持续推进后，成果和学习积累会留在这里。",
        ),
      );
  }
  function decorateProject(card, p) {
    const content = card.querySelector(".project-content"),
      meta = el("div", "strategy-tags project-tags");
    meta.append(
      badge(kindNames[p.kind]),
      badge(executionNames[p.execution], "execution-" + p.execution),
    );
    for (const id of p.goalIds)
      meta.append(
        button(titleOf("goals", id), () => selectGoal(id), "goal-chip"),
      );
    content.prepend(meta);
    if (!p.steps.length) card.querySelector(".project-count").hidden = true;
    const next = card.querySelector(".project-next");
    if (p.nextStep) next.textContent = "下一步：" + p.nextStep;
    if (p.summary) content.append(el("p", "item-summary", p.summary));
    const detailButton = button(
      "详情与记录 →",
      () => detail("projects", p.id),
      "subtle-link item-detail",
    );
    content.append(detailButton);
  }
  function decoratePlan(card, p) {
    if (p.execution === "unknown" || p.execution === "paused")
      card.append(badge(executionNames[p.execution]));
  }
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
  function display(value) {
    if (value === null || value === undefined || value === "") return "（空）";
    if (Array.isArray(value))
      return value
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join("、");
    if (typeof value === "object") return JSON.stringify(value);
    return (
      executionNames[value] ||
      adoptionNames[value] ||
      archiveNames[value] ||
      kindNames[value] ||
      {
        user: "用户记录",
        ai: "AI 建议",
        mixed: "用户记录与 AI 建议",
        legacy: "旧版记录",
        example: "示例",
      }[value] ||
      String(value)
    );
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
  function field(root, label, id, value = "", type = "input", options = null) {
    const wrap = el("label", "field", label),
      input = el(type);
    input.id = id;
    if (type === "textarea") {
      input.rows = 4;
      input.maxLength = 10000;
    } else if (type === "input") input.maxLength = 300;
    if (options) for (const [v, l] of options) input.append(new Option(l, v));
    input.value = value;
    wrap.append(input);
    root.append(wrap);
    return input;
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
    }
    const error = el("p", "form-error");
    error.role = "alert";
    form.append(error);
    const actions = el("div", "dialog-actions"),
      save = el("button", "button primary", "保存");
    save.id = "strategy-save";
    actions.append(button("取消", close), save);
    form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const target = { ...editor };
      if (
        commit((s) => {
          const current = target.id
            ? s[collection].find((r) => r.id === target.id)
            : null;
          if (target.id && (!current || stable(current) !== target.original))
            throw Error("记录已变化，请复制输入后重新打开。");
          const item = {
            ...current,
            id: current?.id || crypto.randomUUID(),
            title: $("strategy-title").value.trim(),
            demo: false,
          };
          if (collection === "goals") {
            item.why = $("strategy-why").value.trim();
            item.directionIds = checked("strategy-directions");
            item.status = $("strategy-goal-status").value;
            item.confirmed = true;
            item.origin = "user";
          } else {
            item.projectId = $("strategy-project").value;
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
              item[key] = $("strategy-" + key).value.trim();
            item.status = !item.answer
              ? item.question
                ? "waiting_answer"
                : "verify"
              : !item.feedback
                ? "waiting_feedback"
                : "recorded";
            item.capturedAt = current?.capturedAt || new Date().toISOString();
            const share = $("strategy-share").value.trim(),
              conversation = $("strategy-conversation").value.trim();
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
        close();
        ctx.render();
      } else error.textContent = ctx.error() || "未保存，输入已保留。";
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
  // Incremental imports are deliberately separate from full backup replacement.
  const update = el("dialog", "dialog update-dialog");
  update.id = "update-dialog";
  update.setAttribute("aria-labelledby", "update-heading");
  document.body.append(update);
  async function importUpdate(raw, aliases = {}) {
    try {
      packet = parseUpdate(raw);
      ctx.refresh();
      mappings = aliases;
      preview = await prepareUpdate(state(), packet, { aliases });
      showPreview();
      if (!update.open) update.showModal();
    } catch (error) {
      toast(error.message);
      if (update.open) {
        const err = $("update-error");
        if (err) err.textContent = error.message;
      }
    }
  }
  function showPreview() {
    update.replaceChildren();
    const header = el("div", "dialog-header"),
      h = el("h2", null, "归档更新预览");
    h.id = "update-heading";
    header.append(
      h,
      button("×", () => update.close(), "icon-button"),
    );
    update.append(
      header,
      el(
        "p",
        "dialog-description",
        "选择要合并的内容。执行进度和手工修改默认保留本地，不会删除已有记录。",
      ),
    );
    const counts = el("div", "import-counts");
    for (const [kind, label] of [
      ["add", "新增"],
      ["update", "可更新"],
      ["conflict", "需确认"],
      ["noop", "相同"],
    ])
      counts.append(
        badge(
          `${label} ${preview.changes.filter((r) => r.action === kind).length}`,
        ),
      );
    update.append(counts);
    if (preview.duplicate)
      update.append(
        el("p", "strategy-empty", "此批次已经导入，没有重复添加。"),
      );
    const list = el("div", "update-list");
    update.append(list);
    for (const row of preview.changes) {
      const wrap = el("article", "update-row");
      const label = el("label", "update-row-heading"),
        check = el("input");
      check.type = "checkbox";
      check.checked = true;
      check.dataset.key = row.key;
      check.setAttribute(
        "aria-label",
        "合并：" +
          (row.incoming.title || row.incoming.body || row.incoming.name),
      );
      label.append(
        check,
        el(
          "strong",
          null,
          row.incoming.title ||
            row.incoming.name ||
            row.incoming.body?.slice(0, 50),
        ),
        badge(
          { add: "新增", update: "更新", conflict: "需确认", noop: "相同" }[
            row.action
          ],
        ),
      );
      wrap.append(label);
      if (
        row.action === "add" &&
        ["projects", "goals", "sources", "archives"].includes(row.collection) &&
        state()[row.collection].length
      ) {
        const map = field(
          wrap,
          "关联到已有记录（手动选择，不按标题自动合并）",
          "mapping-" + row.collection + "-" + row.id,
          "",
          "select",
          [
            ["", "作为新记录"],
            ...state()[row.collection].map((r) => [r.id, r.title]),
          ],
        );
        map.addEventListener("change", () => {
          if (map.value)
            mappings[`${row.collection}:${row.incomingId}`] = map.value;
          importUpdate(packet, mappings);
        });
      }
      if (!row.current) {
        const details = el("details", "import-fields");
        details.append(el("summary", null, "查看新增内容"));
        for (const [key, value] of Object.entries(row.incoming)) {
          if (
            ["id", "demo", "archived", "statusMode"].includes(key) ||
            value == null ||
            value === "" ||
            (Array.isArray(value) && !value.length)
          )
            continue;
          description(details, labels[key] || key, display(value));
        }
        wrap.append(details);
      }
      if (row.current) {
        const details = el("details", "import-fields");
        details.open = row.action === "conflict";
        details.append(el("summary", null, "字段差异与选择"));
        for (const f of row.fields.filter((f) => f.status !== "same")) {
          const fieldRow = el("div", "import-field");
          fieldRow.append(
            el(
              "strong",
              null,
              (labels[f.name] || f.name) +
                (f.protected ? " · 手工进度保护" : ""),
            ),
            el("p", null, "本地：" + display(f.current)),
            el("p", null, "来源：" + display(f.incoming)),
          );
          const choice = field(
            fieldRow,
            "采用",
            "choice-" + row.id + "-" + f.name,
            f.status === "update" ? "incoming" : "local",
            "select",
            [
              ["local", "保留本地"],
              ["incoming", "使用来源"],
            ],
          );
          choice.dataset.row = row.key;
          choice.dataset.field = f.name;
          details.append(fieldRow);
        }
        wrap.append(details);
      }
      list.append(wrap);
    }
    const error = el("p", "form-error");
    error.id = "update-error";
    error.role = "alert";
    update.append(error);
    const actions = el("div", "dialog-actions");
    const apply = button(
      preview.duplicate ? "完成" : "确认合并",
      () => {
        const selected = Array.from(
            update.querySelectorAll("input[data-key]:checked"),
            (i) => i.dataset.key,
          ),
          fields = {};
        for (const select of update.querySelectorAll("select[data-field]")) {
          fields[select.dataset.row] ??= {};
          fields[select.dataset.row][select.dataset.field] = select.value;
        }
        const ok = commit(
          (s) =>
            Object.assign(s, applyUpdate(s, preview, { selected, fields })),
          { requirePersistence: true },
        );
        if (ok) {
          update.close();
          toast(preview.duplicate ? "没有新增重复内容。" : "已合并选定归档。");
        } else {
          error.textContent =
            "未合并：请查看页面提示。如果工作区已变化，请重新预览。";
        }
      },
      "button primary",
    );
    apply.id = "update-apply";
    actions.append(
      button("取消", () => update.close()),
      button("重新预览", () => importUpdate(packet, mappings)),
      apply,
    );
    update.append(actions);
  }
  $("update-file").addEventListener("change", async () => {
    const file = $("update-file").files[0];
    $("update-file").value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("归档文件不能超过 2 MiB");
      return;
    }
    if ($("settings-dialog").open) $("settings-dialog").close();
    await importUpdate(await file.text());
  });
  for (const id of ["update-button", "archive-update-button"])
    $(id).addEventListener("click", () => $("update-file").click());
  $("new-goal").addEventListener("click", () => edit("goals"));
  $("new-archive").addEventListener("click", () => edit("archives"));
  $("archive-filter").addEventListener("change", showArchives);
  return {
    goalMatches,
    goalId: () => goalId,
    clearGoal: () => {
      goalId = "";
    },
    render() {
      const view = ctx.view();
      $("strategy-landscape").hidden = !["overview", "learning"].includes(view);
      $("continuation-strip").hidden = !["overview", "learning"].includes(view);
      $("archive-workspace").hidden = view !== "archives";
      showGoals();
      showContinuation();
      showProposals();
      showArchives();
    },
    decorateProject,
    decoratePlan,
    fillEditor,
    readEditor,
    edit,
    detail,
    importUpdate,
  };
}
