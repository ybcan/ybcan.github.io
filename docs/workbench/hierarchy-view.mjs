import { buildHierarchy } from "#workbench/hierarchy";
import { isProject, completeTask } from "#workbench/work-model";
import {
  adoptionNames,
  executionNames,
  kindNames,
  archiveNames,
} from "#workbench/strategy-common";
const $ = (id) => document.getElementById(id);
export function initHierarchyView(ctx, common, actions) {
  const { el, button, badge, state } = common;
  let mode = "tree";
  const opened = new Set(),
    closed = new Set();
  const mounts = [];
  let mounting = false;
  function requestMount(fn) {
    mounts.push(fn);
    if (mounting) return;
    mounting = true;
    try {
      while (mounts.length) mounts.pop()();
    } finally {
      mounting = false;
    }
  }
  for (const value of ["tree", "list"])
    $("learning-mode-" + value).addEventListener("click", () => {
      mode = value;
      ctx.render();
    });
  function recordRow(node) {
    const row = el(
      "span",
      node.reference
        ? "hierarchy-row hierarchy-reference"
        : "hierarchy-row hierarchy-record",
    );
    row.dataset.key = node.key;
    if (node.reference) row.dataset.target = node.targetKey;
    const name = el("span", "hierarchy-title", node.record.title);
    row.append(name);
    const meta = el("span", "hierarchy-meta");
    if (node.reference) meta.append(badge("关联引用"));
    else if (node.collection === "tasks")
      meta.append(
        badge("任务"),
        badge(node.record.done ? "已完成" : "待完成"),
        badge(adoptionNames[node.record.adoption]),
      );
    else if (node.collection === "projects")
      meta.append(
        badge(kindNames[node.record.kind]),
        badge(adoptionNames[node.record.adoption]),
        badge(
          isProject(node.record)
            ? executionNames[node.record.execution]
            : "知识资料",
        ),
      );
    else if (node.collection === "plans")
      meta.append(
        badge(
          node.record.materialType === "milestone" ? "阶段里程碑" : "方案资料",
        ),
        badge(adoptionNames[node.record.adoption]),
      );
    else if (node.collection === "archives")
      meta.append(badge(archiveNames[node.record.status]));
    else if (node.collection === "goals")
      meta.append(
        badge(
          { active: "长期关注", paused: "暂停关注", archived: "已归档" }[
            node.record.status
          ],
        ),
      );
    row.append(meta);
    if (node.collection !== "group") {
      const buttons = el("span", "hierarchy-actions");
      const bind = (label, fn) => {
        const b = button(
          label,
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            return fn();
          },
          "subtle-link",
        );
        buttons.append(b);
      };
      if (node.collection === "goals")
        bind("编辑", () => actions.edit("goals", node.id));
      else {
        bind(
          ["archives", "tasks"].includes(node.collection)
            ? "查看记录"
            : node.reference
              ? "查看主条目"
              : "详情",
          () => actions.detail(node.collection, node.id),
        );
        bind("编辑", () =>
          node.collection === "archives"
            ? actions.edit("archives", node.id)
            : ctx.openRecord(node.collection, node.id),
        );
        if (
          (["tasks"].includes(node.collection) ||
            (node.collection === "projects" && isProject(node.record))) &&
          node.record.adoption !== "adopted"
        )
          bind("采纳", () =>
            ctx.commit((s) => {
              const r = s[node.collection].find((r) => r.id === node.id);
              r.adoption = "adopted";
              r.demo = false;
            }),
          );
        if (node.collection === "tasks" && node.record.adoption === "adopted")
          bind(node.record.done ? "重新打开" : "完成", () =>
            ctx.commit((s) =>
              completeTask(s, node.id, !node.record.done, node.record),
            ),
          );
      }
      row.append(buttons);
    }
    return row;
  }
  function childGroups(node) {
    if (node.collection === "group") return node.children;
    const records = node.children.filter((c) => c.collection === "archives"),
      materials = node.children.filter(
        (c) =>
          c.collection === "plans" ||
          (c.collection === "projects" && !isProject(c.record)),
      ),
      rest = node.children.filter(
        (c) => c.collection !== "archives" && !materials.includes(c),
      );
    if (materials.length)
      rest.push({
        key: "materials:" + node.key,
        collection: "group",
        id: node.key,
        record: { title: "方案与知识资料 · " + materials.length },
        children: materials,
      });
    if (records.length)
      rest.push({
        key: "folder:" + node.key,
        collection: "group",
        id: node.key,
        record: { title: "学习记录 · " + records.length },
        children: records,
      });
    return rest;
  }
  function appendBatch(parent, children, render = renderNode) {
    let count = 0;
    const more = button(
      "显示更多",
      () => append(),
      "subtle-link hierarchy-more",
    );
    function append() {
      more.remove();
      const end = Math.min(children.length, count + 50);
      for (; count < end; count++) parent.append(render(children[count]));
      if (count < children.length) {
        more.textContent = `显示其余 ${children.length - count} 项`;
        const li = el("li", "hierarchy-more-row");
        li.append(more);
        parent.append(li);
      }
    }
    append();
  }
  function deepRows(node, depth) {
    const rows = [],
      stack = childGroups(node)
        .map((n) => ({ node: n, depth: depth + 1, parent: node.record.title }))
        .reverse();
    while (stack.length) {
      const item = stack.pop();
      if (
        !ctx.query() ||
        ctx.matches(item.node.record, item.node.collection !== "goals")
      )
        rows.push(item);
      if (!item.node.reference)
        for (const child of childGroups(item.node).slice().reverse())
          stack.push({
            node: child,
            depth: item.depth + 1,
            parent: item.node.record.title,
          });
    }
    return rows;
  }
  function renderNode(node, depth = 0) {
    const li = el("li", "hierarchy-node");
    const children = node.reference ? [] : childGroups(node);
    if (!children.length) {
      li.append(recordRow(node));
      return li;
    }
    const details = el("details"),
      summary = el("summary");
    summary.append(recordRow(node));
    details.append(summary);
    let loaded = false;
    const mount = () => {
      if (loaded) return;
      loaded = true;
      const ul = el("ul", "hierarchy-children");
      if (depth >= 12) {
        ul.append(
          el(
            "li",
            "section-description",
            "深层内容按归属列出；中间层级已压缩。",
          ),
        );
        appendBatch(ul, deepRows(node, depth), (item) => {
          const leaf = el("li", "hierarchy-node");
          leaf.append(
            el(
              "small",
              "hierarchy-depth",
              `第 ${item.depth + 1} 级 · 归属：${item.parent}`,
            ),
            recordRow(item.node),
          );
          return leaf;
        });
      } else appendBatch(ul, children, (child) => renderNode(child, depth + 1));
      details.append(ul);
    };
    const expand =
      !!ctx.query() ||
      opened.has(node.key) ||
      (node.collection === "goals" && !closed.has(node.key));
    details.open = expand;
    if (expand) requestMount(mount);
    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;
      if (details.open) {
        opened.add(node.key);
        closed.delete(node.key);
        requestMount(mount);
      } else {
        closed.add(node.key);
        opened.delete(node.key);
      }
    });
    li.append(details);
    return li;
  }
  function render(goalId) {
    const learning = ctx.view() === "learning";
    $("learning-mode").hidden = !learning;
    $("strategy-tree-panel").hidden = !learning || mode !== "tree";
    if (learning) $("overview-grid").hidden = mode === "tree";
    for (const value of ["tree", "list"]) {
      $("learning-mode-" + value).classList.toggle("active", mode === value);
      $("learning-mode-" + value).setAttribute(
        "aria-pressed",
        String(mode === value),
      );
    }
    if (!learning || mode !== "tree") return;
    let roots = buildHierarchy(state(), (r, c) =>
      c === "goals" ? ctx.matches(r, false) : ctx.matches(r),
    );
    if (goalId) roots = roots.filter((r) => r.key === "goals:" + goalId);
    const root = $("strategy-tree");
    root.replaceChildren();
    if (!roots.length)
      root.append(
        el(
          "li",
          "strategy-empty",
          "当前筛选下没有归属内容。可清除筛选，或新建目标和项目。",
        ),
      );
    else appendBatch(root, roots);
    $("tree-scope").textContent = goalId
      ? "正在查看目标：" +
        (state().goals.find((g) => g.id === goalId)?.title || "")
      : "每项内容一份正文；其他目标通过引用关联。";
  }
  return { mode: () => mode, render };
}
