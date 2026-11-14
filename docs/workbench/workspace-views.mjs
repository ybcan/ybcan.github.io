import { tasksForProject, isProject } from "#workbench/work-model";
import { initTaskViews } from "#workbench/task-views";
import { DIRECTIONS, safeUrl } from "#workbench/workspace";
const $ = (id) => document.getElementById(id);
export function initWorkspaceViews(ctx) {
  const { el, icon, commit, openRecord, matches, setView } = ctx;
  const names = {
    tasks: "任务",
    projects: "项目",
    plans: "方案资料",
    notes: "笔记",
    sites: "网站",
    experiments: "实验",
  };
  let notesExpanded = false;
  const taskViews = initTaskViews(ctx);
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
      .projects.filter(
        (p) => isProject(p) && p.adoption === "adopted" && matches(p),
      );
    $("project-summary").textContent = `${projects.length} 个跟踪项目`;
    if (!projects.length)
      empty(
        root,
        ctx.query() || ctx.direction()
          ? "这个筛选下，还没有学习项目。"
          : "把想学的技术或方法，拆成可以完成的任务。",
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
      const tasks = tasksForProject(ctx.state(), project.id).filter(
        (t) => t.adoption === "adopted" && !t.archived,
      );
      const completed = tasks.filter((x) => x.done).length;
      const next = tasks.find((x) => !x.done);
      const subtitle = el(
        "p",
        "project-next",
        tasks.length
          ? next
            ? "下一步：" + next.title
            : "项目任务已完成，记下收获吧。"
          : "还没有正式任务，从项目详情添加。",
      );
      const count = el(
        "span",
        "project-count",
        `${completed} / ${tasks.length} 项任务`,
      );
      content.append(title, subtitle, count);
      if (project.demo) content.append(el("span", "example-label", " · 示例"));
      const steps = el("div", "project-steps");
      for (const task of tasks.slice(0, 5))
        steps.append(taskViews.row(task, "project-" + project.id));
      card.append(symbol, content, steps, editButton("projects", project));
      ctx.strategy()?.decorateProject(card, project);
      root.append(card);
    }
    if (projects.length > visibleProjects.length) {
      const more = el(
        "button",
        "subtle-link more-ctx.strategy()",
        `查看全部 ${projects.length} 个项目 →`,
      );
      more.addEventListener("click", () => setView("learning"));
      root.append(more);
    }
  }

  function renderPlans() {
    taskViews.schedule("plan-columns");
  }
  function renderTasks() {
    taskViews.render();
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
      ctx.view() === "lab" || notesExpanded || ctx.query() ? notes.length : 3;
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
        (view === "overview" ||
          (view === "learning" && ctx.learningMode() === "list")) &&
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
        view === "lab" &&
        !$("notes-panel").classList.contains("is-collapsed")
      )
        renderNotes();
      renderSites();
      if (view === "lab" || ctx.query()) renderExperiments();
      else $("lab-library").hidden = true;
    },
  };
}
