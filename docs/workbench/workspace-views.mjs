import { DIRECTIONS, safeUrl } from "#workbench/workspace";
const $ = (id) => document.getElementById(id);
export function initWorkspaceViews(ctx) {
  const { el, icon, commit, openRecord, matches, setView } = ctx;
  const names = {
    tasks: "待办",
    projects: "学习",
    plans: "计划",
    notes: "笔记",
    sites: "网站",
    experiments: "实验",
  };
  let notesExpanded = false;
  function tag(id) {
    const d = DIRECTIONS.find((x) => x.id === id);
    const node = el("span", "tag");
    if (d) {
      const dot = el("span", "dot");
      dot.style.setProperty("--direction", d.color);
      node.append(dot, document.createTextNode(d.name));
    } else node.textContent = "未归类";
    return node;
  }

  function dateLabel(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function dueLabel(value) {
    return value ? `目标 ${value.replaceAll("-", ".")}` : "";
  }
  function editButton(kind, item) {
    const title = item.title || item.name || item.body.slice(0, 18);
    const button = el("button", "icon-button edit-record");
    button.setAttribute("aria-label", `编辑${names[kind]}：${title}`);
    button.title = "编辑";
    button.append(icon("edit"));
    button.addEventListener("click", () => openRecord(kind, item.id));
    return button;
  }
  function empty(parent, message, kind) {
    const box = el("div", "empty-state");
    box.append(
      icon(kind === "experiments" ? "flask" : "spark"),
      el("p", null, message),
    );
    if (kind) {
      const button = el("button", "button small", "＋ 添加" + names[kind]);
      button.addEventListener("click", () => openRecord(kind));
      box.append(button);
    }
    parent.append(box);
  }

  function renderProjects() {
    const root = $("projects-list");
    root.replaceChildren();
    const projects = ctx
      .state()
      .projects.filter((p) => p.adoption === "adopted" && matches(p));
    $("project-summary").textContent = `${projects.length} 个跟踪事项`;
    if (!projects.length)
      empty(
        root,
        ctx.query() || ctx.direction()
          ? "这个筛选下，还没有学习项目。"
          : "把想学的技术或方法，拆成可以完成的步骤。",
        "projects",
      );
    const visibleProjects =
      ctx.view() === "overview" &&
      !ctx.query() &&
      !ctx.direction() &&
      !ctx.strategy()?.goalId()
        ? projects.slice(0, 3)
        : projects;
    for (const project of visibleProjects) {
      const card = el("article", "project");
      const symbol = el("div", "project-icon");
      symbol.append(
        icon(
          DIRECTIONS.find((d) => d.id === project.direction)?.icon || "learn",
        ),
      );
      const content = el("div", "project-content"),
        title = el("div", "project-title-row");
      title.append(el("h3", null, project.title), tag(project.direction));
      const completed = project.steps.filter((x) => x.done).length;
      const next = project.steps.find((x) => !x.done);
      const subtitle = el(
        "p",
        "project-next",
        project.steps.length
          ? next
            ? "下一步：" + next.title
            : "这一组步骤已完成，记下收获吧。"
          : "还没有学习步骤，点击编辑来拆解。",
      );
      const count = el(
        "span",
        "project-count",
        `${completed} / ${project.steps.length} 步`,
      );
      content.append(title, subtitle, count);
      if (project.demo) content.append(el("span", "example-label", " · 示例"));
      const steps = el("div", "project-steps");
      project.steps.forEach((step, index) => {
        if (index) steps.append(el("span", "step-arrow", "›"));
        const label = el("label", "step-pill" + (step.done ? " done" : ""));
        const input = el("input");
        input.type = "checkbox";
        input.checked = step.done;
        input.dataset.focusKey = step.id;
        input.addEventListener("change", () =>
          commit((s) => {
            const p = s.projects.find((x) => x.id === project.id);
            p.steps.find((x) => x.id === step.id).done = input.checked;
            p.demo = false;
          }),
        );
        label.append(input, el("span", null, step.title));
        steps.append(label);
      });
      card.append(symbol, content, steps, editButton("projects", project));
      ctx.strategy()?.decorateProject(card, project);
      root.append(card);
    }
    if (projects.length > visibleProjects.length) {
      const more = el(
        "button",
        "subtle-link more-ctx.strategy()",
        `查看全部 ${projects.length} 个事项 →`,
      );
      more.addEventListener("click", () => setView("learning"));
      root.append(more);
    }
  }

  function renderPlans() {
    const root = $("plan-columns");
    root.replaceChildren();
    if (
      !ctx.state().plans.some((p) => p.adoption === "adopted" && matches(p))
    ) {
      root.append(
        el(
          "p",
          "section-description empty-plans",
          "还没有正式计划，可以从下方候选规划中选择，也可以自己新建。",
        ),
      );
      return;
    }
    const statuses = [
      ["next", "准备开始", "#b99be9"],
      ["active", "正在推进", "#7ce8ee"],
      ["done", "回顾与沉淀", "#c0a1ed"],
    ];
    for (const [status, name, color] of statuses) {
      const section = el("section", "plan-column");
      section.dataset.status = status;
      section.style.setProperty("--column", color);
      const plans = ctx
        .state()
        .plans.filter(
          (p) => p.adoption === "adopted" && p.status === status && matches(p),
        );
      const heading = el("div", "column-heading", name);
      heading.append(el("span", "count", String(plans.length)));
      const cards = el("div", "plan-cards");
      if (!plans.length) empty(cards, "留一点空间给下一步。");
      for (const plan of plans) {
        const card = el("article", "plan-card");
        const title = el("button", "plan-title", plan.title);
        title.addEventListener("click", () => openRecord("plans", plan.id));
        const footer = el("div", "plan-footer"),
          advance = el("button", "advance-plan");
        advance.setAttribute("aria-label", `推进计划：${plan.title}`);
        advance.title =
          status === "done"
            ? "重新准备"
            : status === "next"
              ? "开始推进"
              : "完成并沉淀";
        advance.append(icon(status === "done" ? "return" : "arrow-right"));
        advance.addEventListener("click", () =>
          commit((s) => {
            const item = s.plans.find((x) => x.id === plan.id);
            if (
              !item ||
              item.status !== plan.status ||
              item.execution !== plan.execution ||
              item.adoption !== plan.adoption
            )
              throw Error("计划状态已有变化，请刷新后再推进。");
            item.status = { next: "active", active: "done", done: "next" }[
              status
            ];
            item.execution = {
              next: "not_started",
              active: "active",
              done: "completed",
            }[item.status];
            item.demo = false;
          }),
        );
        footer.append(tag(plan.direction), advance);
        if (plan.demo)
          footer.insertBefore(el("span", "example-label", "示例"), advance);
        card.append(title, editButton("plans", plan), footer);
        if (plan.dueDate)
          card.append(el("p", "plan-meta", dueLabel(plan.dueDate)));
        ctx.strategy()?.decoratePlan(card, plan);
        cards.append(card);
      }
      section.append(heading, cards);
      root.append(section);
    }
  }

  function renderTasks() {
    const root = $("tasks-list");
    root.replaceChildren();
    const tasks = ctx.state().tasks.filter(matches);
    $("task-count").textContent = String(tasks.filter((x) => !x.done).length);
    const filter = $("task-filter").value;
    const visible = tasks.filter(
      (t) => filter === "all" || (filter === "done" ? t.done : !t.done),
    );
    if (!visible.length) {
      empty(
        root,
        filter === "done"
          ? "完成的事情会留在这里。"
          : "暂时没有待办，从一件小事开始。",
      );
      root.firstChild.classList.add("task-empty");
    }
    for (const task of visible) {
      const row = el("div", "task-row" + (task.done ? " done" : ""));
      const check = el("input");
      check.type = "checkbox";
      check.checked = task.done;
      check.id = "task-" + task.id;
      check.setAttribute("aria-label", `完成待办：${task.title}`);
      check.dataset.focusKey = task.id;
      check.addEventListener("change", () =>
        commit((s) => {
          const item = s.tasks.find((x) => x.id === task.id);
          item.done = check.checked;
          item.demo = false;
        }),
      );
      const content = el("div", "task-content"),
        title = el("label", "task-title", task.title);
      title.htmlFor = check.id;
      const meta = el("div", "task-meta");
      meta.append(tag(task.direction));
      if (task.demo) meta.append(el("span", "example-label", "示例"));
      if (task.dueDate) meta.append(el("span", null, dueLabel(task.dueDate)));
      content.append(title, meta);
      row.append(check, content, editButton("tasks", task));
      root.append(row);
    }
  }

  function renderNotes() {
    const root = $("notes-list");
    root.replaceChildren();
    const notes = ctx.state().notes.filter(matches);
    $("note-count").textContent = `${notes.length} 条`;
    if (!notes.length)
      empty(
        root,
        ctx.query() || ctx.direction()
          ? "这个筛选下，还没有随手记。"
          : "不必想清楚再记录，一句话也可以。",
      );
    const limit =
      ctx.view() === "notes" || notesExpanded || ctx.query() ? notes.length : 3;
    for (const note of notes.slice(0, limit)) {
      const item = el("article", "note-item"),
        symbol = el("div", "note-symbol");
      symbol.append(icon("document"));
      const body = el("div", "note-body"),
        meta = el("div", "note-meta");
      meta.append(
        tag(note.direction),
        el(
          "time",
          note.demo ? "example-label" : null,
          note.demo ? "示例" : dateLabel(note.createdAt),
        ),
      );
      body.append(el("p", null, note.body), meta);
      item.append(symbol, body, editButton("notes", note));
      root.append(item);
    }
    if (notes.length > limit) {
      const more = el(
        "button",
        "subtle-link more-notes",
        `查看其余 ${notes.length - limit} 条记录 →`,
      );
      more.addEventListener("click", () => {
        notesExpanded = true;
        renderNotes();
      });
      root.append(more);
    }
  }

  function renderSites() {
    const root = $("sites-list");
    root.replaceChildren();
    const sites = ctx
      .state()
      .sites.filter(
        (s) => !ctx.query() || s.name.toLocaleLowerCase().includes(ctx.query()),
      );
    for (const site of sites) {
      const wrap = el("div", "site-tile-wrap"),
        link = el("a", "dock-tile");
      link.href = safeUrl(site.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = site.url;
      const known = {
        ChatGPT: "swirl",
        Claude: "spark",
        ima: "spark",
        GitHub: "github",
        arXiv: "code",
      }[site.name];
      if (known) link.append(icon(known));
      else {
        const letter = el("span", "site-letter", Array.from(site.name)[0]);
        letter.setAttribute("aria-hidden", "true");
        link.append(letter);
      }
      if (site.name === "Claude") link.classList.add("site-claude");
      if (site.name === "ima") link.classList.add("site-ima");
      link.append(el("span", null, site.name));
      wrap.append(link, editButton("sites", site));
      root.append(wrap);
    }
    if (!sites.length)
      empty(root, ctx.query() ? "没有匹配的网站。" : "添加你的常用网站。");
  }

  function renderExperiments() {
    const root = $("experiment-list");
    root.replaceChildren();
    const experiments = ctx.state().experiments.filter(matches);
    if (!experiments.length)
      empty(root, "下一个实验，可以从一个很小的问题开始。", "experiments");
    for (const experiment of experiments) {
      const card = el("article", "experiment-card"),
        top = el("div", "experiment-top");
      top.append(
        el("h3", null, experiment.title),
        editButton("experiments", experiment),
      );
      const footer = el("div", "experiment-footer");
      footer.append(
        tag(experiment.direction),
        el(
          "span",
          "experiment-status",
          { idea: "构想中", building: "开发中", ready: "已完成" }[
            experiment.status
          ],
        ),
      );
      if (experiment.url) {
        const a = el("a", null, "打开工具 ↗");
        a.href = safeUrl(experiment.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        footer.append(a);
      }
      card.append(
        top,
        el("p", null, experiment.description || "还没有补充描述。"),
        footer,
      );
      root.append(card);
    }
    $("lab-library").hidden =
      ctx.view() !== "lab" && !(ctx.query() && experiments.length);
  }

  return {
    render() {
      const view = ctx.view();
      if (
        ["overview", "learning"].includes(view) &&
        !$("learning-workspace").classList.contains("is-collapsed")
      ) {
        renderProjects();
        renderPlans();
      }
      if (
        ["overview", "tasks"].includes(view) &&
        !$("tasks-panel").classList.contains("is-collapsed")
      )
        renderTasks();
      if (
        ["overview", "notes"].includes(view) &&
        !$("notes-panel").classList.contains("is-collapsed")
      )
        renderNotes();
      renderSites();
      if (view === "lab" || ctx.query()) renderExperiments();
      else $("lab-library").hidden = true;
    },
  };
}
