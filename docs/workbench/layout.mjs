// @ts-check
/** @param {{render:()=>void}} ctx */
export function initLayout(ctx) {
  const key = "personal-cockpit.layout.v1";
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {}
  for (const id of [
    "strategy-landscape",
    "learning-workspace",
    "tasks-panel",
    "notes-panel",
    "tool-dock",
  ]) {
    const panel = document.getElementById(id),
      heading = panel?.querySelector(".section-heading,.dock-heading");
    if (!panel || !heading) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "fold-" + id;
    b.className = "fold-button";
    const title = heading.querySelector("h2")?.textContent || "区块";
    const apply = () => {
      const folded = prefs[id] === true;
      panel.classList.toggle("is-collapsed", folded);
      b.textContent = folded ? "＋" : "−";
      b.setAttribute("aria-expanded", String(!folded));
      b.setAttribute("aria-label", (folded ? "展开" : "收起") + title);
    };
    b.addEventListener("click", () => {
      prefs[id] = prefs[id] !== true;
      try {
        localStorage.setItem(key, JSON.stringify(prefs));
      } catch {}
      apply();
      ctx.render();
    });
    heading.append(b);
    apply();
  }
}
