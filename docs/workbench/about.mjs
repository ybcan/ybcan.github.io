// @ts-check
export const APP_INFO = {
  version: "0.5.1",
  author: "ybcan",
  updated: "2026-11-16",
  source: "https://github.com/ybcan/ybcan.github.io",
};
/** @param {{el:(tag:string,cls?:string,text?:string)=>any}} ctx */
export function initAbout({ el }) {
  const button = el("button", "subtle-link", "关于 · v" + APP_INFO.version);
  button.id = "about-button";
  button.type = "button";
  const dialog = el("dialog", "dialog compact-dialog");
  dialog.id = "about-dialog";
  dialog.setAttribute("aria-labelledby", "about-heading");
  const heading = el("h2", null, "战略工作台");
  heading.id = "about-heading";
  const close = el("button", "button small", "关闭");
  close.type = "button";
  close.addEventListener("click", () => dialog.close());
  dialog.append(
    heading,
    el(
      "p",
      "dialog-description",
      `版本 ${APP_INFO.version} · 作者 ${APP_INFO.author} · 更新 ${APP_INFO.updated}`,
    ),
    el(
      "p",
      "dialog-description",
      "以长期目标连接学习、实践与日常行动。个人记录保存在你的工作区，可连接独立文件备份。",
    ),
  );
  for (const [text, url] of [
    ["查看源码", APP_INFO.source],
    ["MIT 许可证", APP_INFO.source + "/blob/master/LICENSE"],
    ["许可范围", APP_INFO.source + "/blob/master/LICENSE-SCOPE.md"],
  ]) {
    const link = el("a", "button small", text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    dialog.append(link);
  }
  dialog.append(close);
  document.body.append(dialog);
  document.querySelector(".page-footer")?.append(button);
  button.addEventListener("click", () => dialog.showModal());
}
