import { prepareUpdate, applyUpdate, parseUpdate } from "#workbench/strategy";
import { labels } from "#workbench/strategy-common";
const $ = (id) => document.getElementById(id);
export function initUpdatePreview(ctx, common) {
  const {
    el,
    commit,
    toast,
    state,
    button,
    badge,
    description,
    field,
    display,
  } = common;
  let preview = null,
    packet = null,
    mappings = {};
  // Incremental imports are deliberately separate from full backup replacement.
  const update = el("dialog", "dialog update-dialog");
  update.id = "update-dialog";
  update.setAttribute("aria-labelledby", "update-heading");
  document.body.append(update);
  async function importUpdate(raw, aliases = {}) {
    try {
      if (update.open)
        update.querySelectorAll("button").forEach((b) => (b.disabled = true));
      packet = parseUpdate(raw);
      await ctx.refresh();
      mappings = aliases;
      preview = await prepareUpdate(state(), packet, { aliases });
      showPreview();
      if (!update.open) update.showModal();
    } catch (error) {
      update.querySelectorAll("button").forEach((b) => (b.disabled = false));
      toast(error.message);
      if (update.open) {
        const err = $("update-error");
        if (err) err.textContent = error.message;
      }
    }
  }
  function fieldValue(name, value) {
    if (name === "parentRef" && value) {
      const record =
        state()[value.collection]?.find((r) => r.id === value.id) ||
        preview.changes.find(
          (r) => r.collection === value.collection && r.id === value.id,
        )?.incoming;
      return (
        ({ goals: "目标", projects: "事项", plans: "阶段计划" }[
          value.collection
        ] || "归属") +
        " · " +
        (record?.title || value.id)
      );
    }
    return display(value);
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
          description(details, labels[key] || key, fieldValue(key, value));
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
            el("p", null, "本地：" + fieldValue(f.name, f.current)),
            el("p", null, "来源：" + fieldValue(f.name, f.incoming)),
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
      async () => {
        const selected = Array.from(
            update.querySelectorAll("input[data-key]:checked"),
            (i) => i.dataset.key,
          ),
          fields = {};
        for (const select of update.querySelectorAll("select[data-field]")) {
          fields[select.dataset.row] ??= {};
          fields[select.dataset.row][select.dataset.field] = select.value;
        }
        const ok = await commit(
          (s) =>
            Object.assign(s, applyUpdate(s, preview, { selected, fields })),
          { requirePersistence: true },
        );
        if (ok) {
          update.close();
          toast(preview.duplicate ? "没有新增重复内容。" : "已合并选定归档。");
        } else {
          error.textContent = ctx.error() || "未合并，请重新预览。";
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
    if (file.size > 32 * 1024 * 1024) {
      toast("归档文件不能超过 32 MiB");
      return;
    }
    if ($("settings-dialog").open) $("settings-dialog").close();
    await importUpdate(await file.text());
  });
  for (const id of ["update-button", "archive-update-button"])
    $(id).addEventListener("click", () => $("update-file").click());

  return { importUpdate };
}
