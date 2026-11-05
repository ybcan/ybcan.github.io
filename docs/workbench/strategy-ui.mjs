import { DIRECTIONS } from "#workbench/workspace";
import {
  createStrategyUI,
  executionNames,
  adoptionNames,
  kindNames,
  archiveNames,
} from "#workbench/strategy-common";
import { initStrategyEditor } from "#workbench/strategy-editor";
import { initUpdatePreview } from "#workbench/update-preview";
import { initHierarchyView } from "#workbench/hierarchy-view";
import { createGoalResolver } from "#workbench/hierarchy";
const $ = (id) => document.getElementById(id);
export function initStrategy(ctx) {
  const common = createStrategyUI(ctx);
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
  } = common;
  let goalId = "";
  let page = 0,
    pageToken = "";
  let editorModule;
  let hierarchy;
  let indexedState, indexedGoal;
  const edit = (...args) => editorModule.edit(...args),
    detail = (...args) => editorModule.detail(...args);
  function goalMatches(item) {
    if (indexedState !== state()) {
      indexedState = state();
      indexedGoal = createGoalResolver(indexedState);
    }
    return (
      !goalId ||
      indexedGoal(item) === goalId ||
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
    if ($("learning-workspace").classList.contains("is-collapsed"))
      $("fold-learning-workspace")?.click();
    ctx.setView("learning");
    $(
      hierarchy.mode() === "tree" ? "strategy-tree-panel" : "projects-list",
    ).scrollIntoView({ behavior: "smooth", block: "start" });
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
              async () =>
                await commit((s) => {
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
    function paginate(items) {
      const token = [
        mode,
        ctx.query(),
        ctx.direction(),
        goalId,
        items.length,
      ].join("|");
      if (token !== pageToken) {
        page = 0;
        pageToken = token;
      }
      const pages = Math.max(1, Math.ceil(items.length / 20));
      page = Math.max(0, Math.min(page, pages - 1));
      $("archive-page").textContent =
        `${page + 1} / ${pages} · ${items.length} 条`;
      $("archive-prev").disabled = page === 0;
      $("archive-next").disabled = page >= pages - 1;
      return items.slice(page * 20, (page + 1) * 20);
    }
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
      const steps = state()
        .projects.filter(ctx.matches)
        .flatMap((p) => p.steps.filter((s) => s.done).map((s) => ({ p, s })));
      for (const entry of paginate([...completed, ...steps])) {
        const row = el("article", "history-row");
        if (entry.r) {
          const { collection, r } = entry;
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
        } else {
          const { p, s } = entry;
          row.append(
            icon("check"),
            el("div", null, p.title + " / " + s.title),
            badge("步骤完成"),
            button("查看事项", () => detail("projects", p.id)),
          );
        }
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
      for (const r of paginate(rounds)) {
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

  editorModule = initStrategyEditor(ctx, common, selectGoal);
  const { fillEditor, readEditor } = editorModule;
  const { importUpdate } = initUpdatePreview(ctx, common);
  hierarchy = initHierarchyView(ctx, common, { edit, detail });
  $("new-goal").addEventListener("click", () => edit("goals"));
  $("new-archive").addEventListener("click", () => edit("archives"));
  $("archive-filter").addEventListener("change", showArchives);
  $("archive-prev").addEventListener("click", () => {
    page--;
    showArchives();
  });
  $("archive-next").addEventListener("click", () => {
    page++;
    showArchives();
  });
  return {
    learningMode: () => hierarchy.mode(),
    goalMatches,
    goalId: () => goalId,
    clearGoal: () => {
      goalId = "";
    },
    render() {
      const view = ctx.view(),
        list = hierarchy.mode() === "list";
      $("strategy-landscape").hidden = !(
        view === "overview" ||
        (view === "learning" && list)
      );
      $("continuation-strip").hidden = !(
        view === "overview" ||
        (view === "learning" && list)
      );
      $("archive-workspace").hidden = view !== "archives";
      if (view === "overview" || (view === "learning" && list)) {
        if (!$("strategy-landscape").classList.contains("is-collapsed"))
          showGoals();
        showContinuation();
        if (!$("learning-workspace").classList.contains("is-collapsed"))
          showProposals();
      }
      if (view === "archives") showArchives();
      hierarchy.render(goalId);
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
