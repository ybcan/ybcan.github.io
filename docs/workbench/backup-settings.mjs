// @ts-check
import { FileBackups } from "#workbench/file-backups";
import { parseBackup, serializeBackup } from "#workbench/workspace";
/** @param {any} ctx */
export async function initBackupSettings(ctx) {
  const { el, store } = ctx,
    $ = (id) => document.getElementById(id);
  const manager = new FileBackups(store);
  let timer = 0;
  const root = el("section", "backup-settings");
  root.id = "backup-settings";
  root.append(
    el("h3", null, "独立文件备份"),
    el(
      "p",
      "dialog-description",
      "选择本机或同步盘目录后，页面打开期间自动保留多个 JSON 版本。清除浏览器后可重新选择目录恢复；手机可手动导出。",
    ),
  );
  const status = el("p", "settings-message");
  status.id = "backup-status";
  status.role = "status";
  root.append(status);
  const actions = el("div", "strategy-actions");
  function button(id, label, fn) {
    const b = el("button", "button small", label);
    b.id = id;
    b.type = "button";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (error) {
        manager.status.message =
          error instanceof Error ? error.message : String(error);
        status.textContent = manager.status.message;
      } finally {
        b.disabled = false;
        render();
      }
    });
    actions.append(b);
    return b;
  }
  async function flush(force = false) {
    clearTimeout(timer);
    if (!manager.directory || !manager.enabled) {
      render();
      return;
    }
    try {
      const raw = await store.read();
      const snapshot = raw ?? serializeBackup(ctx.state());
      try {
        parseBackup(snapshot);
      } catch (error) {
        manager.status.state = "error";
        manager.status.message =
          "工作副本异常，文件备份已暂停：" + error.message;
        throw Error(manager.status.message);
      }
      await manager.write(snapshot, { force });
    } finally {
      render();
    }
  }
  button("backup-connect", "选择 / 重新连接目录", async () => {
    const picker = /** @type {any} */ (window).showDirectoryPicker;
    if (!picker) throw Error("此浏览器不支持目录备份，请使用下方导出 JSON");
    const directory = await picker({
      mode: "readwrite",
      id: "strategy-workbench-backups",
    });
    await manager.connect(directory);
    await refresh();
    if (manager.enabled) await flush();
  });
  button("backup-now", "保留当前并立即备份", async () => {
    await manager.enable();
    await flush(true);
    await refresh();
  });
  button("backup-disconnect", "断开目录", async () => {
    clearTimeout(timer);
    await manager.disconnect();
    await refresh();
  });
  root.append(actions);
  const select = el("select");
  select.id = "backup-versions";
  select.setAttribute("aria-label", "备份版本");
  root.append(select);
  const versionActions = el("div", "strategy-actions");
  root.append(versionActions);
  function versionButton(id, label, fn) {
    const b = el("button", "button small", label);
    b.id = id;
    b.type = "button";
    b.addEventListener("click", async () => {
      try {
        await fn();
      } catch (error) {
        manager.status.message =
          error instanceof Error ? error.message : String(error);
        status.textContent = manager.status.message;
      }
    });
    versionActions.append(b);
    return b;
  }
  versionButton("backup-refresh", "刷新版本列表", refresh);
  versionButton("backup-restore", "恢复选中版本", async () => {
    if (!select.value) throw Error("请先选择备份版本");
    const raw = await manager.read(select.value);
    const imported = parseBackup(raw);
    await ctx.restore(imported);
    await refresh();
  });
  async function refresh() {
    select.replaceChildren();
    if (manager.directory) {
      for (const f of await manager.list())
        select.append(new Option(f.name, f.name));
    }
    render();
  }
  function render() {
    const supported =
      typeof (/** @type {any} */ (window).showDirectoryPicker) === "function";
    $("backup-connect").hidden = !supported;
    /** @type {HTMLButtonElement} */ ($("backup-now")).disabled =
      !manager.directory;
    /** @type {HTMLButtonElement} */ ($("backup-disconnect")).disabled =
      !manager.directory;
    status.textContent =
      (supported
        ? manager.status.message
        : "此浏览器不支持自动目录备份，请手动导出 JSON。") +
      (manager.status.lastSuccess
        ? " · 上次成功：" +
          new Date(manager.status.lastSuccess).toLocaleString("zh-CN")
        : "") +
      (manager.status.state === "permission" ? " · 请点击重新连接授权" : "");
  }
  $("settings-dialog").insertBefore(root, $("settings-message"));
  try {
    await manager.init();
    await refresh();
  } catch (error) {
    manager.status.message = "备份配置读取失败，可重新连接目录";
    render();
  }
  return {
    manager,
    render,
    flush,
    schedule() {
      if (!manager.enabled || !manager.directory) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => flush().catch(() => {}), 1200);
    },
    async beforeRestore(raw) {
      if (!manager.directory) return true;
      try {
        if (!manager.enabled) await manager.enable();
        await manager.write(raw);
        render();
        return true;
      } catch {
        render();
        return ctx.confirm(
          "保护备份未成功",
          "当前文件备份未成功。仍要替换工作区吗？建议取消后先手动导出当前内容。",
          "仍然恢复",
        );
      }
    },
  };
}
