import {
  completeTask,
  isFormalTask,
  taskBucket,
  localDate,
} from "#workbench/work-model";
export function initTaskViews(ctx) {
  const { el, commit, openRecord } = ctx;
  let mode = "todo";
  const $ = (id) => document.getElementById(id);
  function row(task, scope = "tasks") {
    const root = el("div", "task-row" + (task.done ? " done" : ""));
    root.dataset.taskId = task.id;
    const check = el("input");
    check.type = "checkbox";
    check.checked = task.done;
    check.id = scope + "-" + task.id;
    check.setAttribute("aria-label", "完成任务：" + task.title);
    check.dataset.focusKey = task.id;
    check.disabled = task.adoption !== "adopted";
    check.addEventListener("change", async () => {
      if (!(await commit((s) => completeTask(s, task.id, check.checked, task))))
        check.checked = task.done;
    });
    const content = el("div", "task-content"),
      title = el("label", "task-title", task.title);
    title.htmlFor = check.id;
    const meta = el("div", "task-meta");
    const project = ctx.state().projects.find((p) => p.id === task.projectId);
    if (project) meta.append(el("span", null, project.title));
    if (task.priority === "high")
      meta.append(el("span", "priority-high", "高优先级"));
    if (task.scheduledFor)
      meta.append(el("span", null, "安排 " + task.scheduledFor));
    if (task.dueDate) meta.append(el("span", null, "截止 " + task.dueDate));
    if (task.adoption !== "adopted")
      meta.append(
        el(
          "span",
          null,
          { candidate: "建议待确认", deferred: "暂缓", rejected: "不采用" }[
            task.adoption
          ],
        ),
      );
    if (task.demo) meta.append(el("span", "example-label", "示例"));
    const edit = el("button", "icon-button task-edit");
    edit.replaceChildren(ctx.icon("edit"));
    edit.setAttribute("aria-label", "编辑任务：" + task.title);
    edit.addEventListener("click", () => openRecord("tasks", task.id));
    content.append(title, meta);
    root.append(check, content, edit);
    return root;
  }
  function schedule(id) {
    const root = $(id);
    root.replaceChildren();
    const tasks = ctx
      .state()
      .tasks.filter((t) => isFormalTask(t) && !t.done && ctx.matches(t))
      .sort((a, b) =>
        (a.scheduledFor || "9999").localeCompare(b.scheduledFor || "9999"),
      );
    for (const [key, label] of [
      ["unscheduled", "未安排"],
      ["week", "近期安排"],
      ["later", "后续安排"],
    ]) {
      const section = el("section", "plan-column"),
        heading = el("div", "column-heading", label),
        list = el("div", "plan-cards");
      const selected = tasks.filter((t) => taskBucket(t) === key);
      heading.append(el("span", "count", String(selected.length)));
      section.append(heading, list);
      const visible =
        ctx.view() === "overview" ? selected.slice(0, 3) : selected;
      for (const task of visible) list.append(row(task, id));
      if (!selected.length)
        list.append(el("p", "section-description", "暂无任务。"));
      if (visible.length < selected.length) {
        const more = el(
          "button",
          "subtle-link",
          `查看全部 ${selected.length} 项`,
        );
        more.addEventListener("click", () => ctx.setView("tasks"));
        list.append(more);
      }
      root.append(section);
    }
  }
  function render() {
    const all = ctx.state().tasks.filter(ctx.matches),
      formal = all.filter(isFormalTask);
    $("task-count").textContent = String(formal.filter((t) => !t.done).length);
    $("tasks-list").hidden = mode !== "todo";
    $("task-quick").hidden = mode !== "todo";
    $("task-filter").hidden = mode !== "todo";
    $("task-schedule").hidden = mode !== "planning";
    for (const value of ["todo", "planning"]) {
      const b = $("task-mode-" + value);
      b.classList.toggle("active", mode === value);
      b.setAttribute("aria-pressed", String(mode === value));
    }
    if (mode === "planning") {
      schedule("task-schedule");
      return;
    }
    const root = $("tasks-list");
    root.replaceChildren();
    const filter = $("task-filter").value,
      today = localDate();
    const tasks = (
      filter === "candidate"
        ? all.filter((t) => t.adoption !== "adopted" && !t.archived)
        : formal
    ).filter(
      (t) =>
        filter === "candidate" ||
        filter === "all" ||
        (filter === "done"
          ? t.done
          : filter === "today"
            ? !t.done && t.scheduledFor === today
            : filter === "week"
              ? !t.done && taskBucket(t) === "week"
              : !t.done),
    );
    tasks.sort(
      (a, b) =>
        ({ high: 0, normal: 1, low: 2 })[a.priority] -
          { high: 0, normal: 1, low: 2 }[b.priority] ||
        (a.scheduledFor || "9999").localeCompare(b.scheduledFor || "9999"),
    );
    for (const t of tasks) root.append(row(t));
    if (!tasks.length)
      root.append(
        el(
          "p",
          "empty-state task-empty",
          filter === "candidate"
            ? "没有待确认的任务建议。"
            : "当前筛选下没有任务。",
        ),
      );
  }
  for (const value of ["todo", "planning"])
    $("task-mode-" + value).addEventListener("click", () => {
      mode = value;
      ctx.render();
    });
  return { render, schedule, row };
}
