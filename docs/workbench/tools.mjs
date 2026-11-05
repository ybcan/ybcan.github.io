import { textStatistics, formatJson } from "#workbench/workspace";
import { loadFocus, saveFocus } from "#workbench/focus-state";
const $ = (id) => document.getElementById(id);
export function initTools(ctx) {
  const { el, icon, toast } = ctx;
  const storage = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  };
  const clock = loadFocus(storage);
  function openTool(kind) {
    if (kind === "focus") {
      $("focus-minutes").value = clock.duration / 60;
      $("focus-dialog").showModal();
      return;
    }
    $("tool-heading").textContent =
      kind === "text" ? "文本处理 · 字符与行数" : "JSON 整理";
    const content = $("tool-content");
    content.replaceChildren();
    const input = el("textarea", "tool-input");
    input.id = "tool-input";
    input.setAttribute(
      "aria-label",
      kind === "text" ? "待统计文本" : "待整理 JSON",
    );
    input.placeholder =
      kind === "text" ? "在这里输入或粘贴文本…" : '{"hello": "world"}';
    input.spellcheck = false;
    const result = el("div", "tool-result");
    result.id = "tool-result";
    result.setAttribute("role", "status");
    content.append(input);
    if (kind === "text") {
      const update = () => {
        const stats = textStatistics(input.value);
        result.textContent = `${stats.characters} 个字符 · ${stats.nonWhitespace} 个非空白字符 · ${stats.lines} 行`;
      };
      input.addEventListener("input", update);
      update();
    } else {
      const format = el("button", "button primary", "格式化并检查");
      format.id = "json-format";
      format.addEventListener("click", () => {
        try {
          input.value = formatJson(input.value);
          result.classList.remove("error");
          result.textContent = "✓ JSON 语法有效，已格式化。";
        } catch (error) {
          result.classList.add("error");
          result.textContent = "JSON 无效：" + error.message;
        }
      });
      content.append(format);
      result.textContent = "输入 JSON 后点击检查；失败时会保留原始输入。";
    }
    content.append(result);
    $("tool-dialog").showModal();
    input.focus();
  }

  let wasRunning = false;
  function updateClock() {
    const value = clock.read();
    const minutes = Math.floor(value.remainingSeconds / 60),
      seconds = value.remainingSeconds % 60;
    $("focus-time").textContent =
      String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    $("focus-toggle").replaceChildren(icon(value.running ? "pause" : "play"));
    $("focus-toggle").setAttribute(
      "aria-label",
      value.running ? "暂停专注" : "开始专注",
    );
    $("focus-toggle").title = value.running ? "暂停专注" : "开始专注";
    if (wasRunning && !value.running && value.remainingSeconds === 0)
      toast("这一段专注完成了，休息一下。");
    wasRunning = value.running;
  }
  $("focus-toggle").addEventListener("click", () => {
    if (clock.read().running) clock.pause();
    else clock.start();
    updateClock();
    saveFocus(storage, clock);
  });
  $("focus-reset").addEventListener("click", () => {
    clock.reset();
    saveFocus(storage, clock);
    updateClock();
  });
  $("focus-settings").addEventListener("click", () => openTool("focus"));
  $("focus-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      clock.reset(Number($("focus-minutes").value) * 60);
      saveFocus(storage, clock);
      updateClock();
      $("focus-dialog").close();
    } catch (error) {
      toast(error.message);
    }
  });
  document.querySelectorAll("[data-minutes]").forEach((b) =>
    b.addEventListener("click", () => {
      $("focus-minutes").value = b.dataset.minutes;
    }),
  );
  setInterval(updateClock, 500);
  document.addEventListener("visibilitychange", updateClock);

  updateClock();
  return { open: openTool };
}
