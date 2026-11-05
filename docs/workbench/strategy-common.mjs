import { DIRECTIONS } from "#workbench/workspace";
export const executionNames = {
  unknown: "进度待确认",
  not_started: "未开始",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};
export const adoptionNames = {
  candidate: "建议待确认",
  adopted: "已采纳",
  deferred: "暂缓",
  rejected: "不采用",
};
export const kindNames = {
  project: "实践项目",
  learning: "持续学习",
  research: "专题研究",
  method: "共通方法",
  idea: "探索想法",
};
export const archiveNames = {
  waiting_answer: "待回答",
  waiting_feedback: "待点评",
  recorded: "已归档",
  verify: "待验证",
};
export const labels = {
  title: "名称",
  parentRef: "归属位置",
  summary: "概述",
  nextStep: "下一步",
  execution: "执行状态",
  adoption: "采纳状态",
  directionIds: "关联方向",
  goalIds: "关联目标",
  itemIds: "关联事项",
  answer: "用户回答",
  question: "题目",
  feedback: "AI 点评",
  sourceRefs: "来源依据",
  sourceTime: "原始时间",
  capturedAt: "归档时间",
  steps: "步骤",
  status: "记录状态",
  relations: "事项关系",
  origin: "内容来源",
  practiceRule: "跟进规则",
  acceptance: "验收要求",
  why: "目标原因",
  confirmed: "目标确认",
  nextAction: "下一步",
  nextQuestion: "下一问题",
  blindSpots: "盲区",
  score: "本题评分",
  excerpt: "关键摘录",
  shareUrl: "分享链接",
  conversationUrl: "原对话链接",
};
const $ = (id) => document.getElementById(id);
export function display(value) {
  if (value === null || value === undefined || value === "") return "（空）";
  if (Array.isArray(value))
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return (
    executionNames[value] ||
    adoptionNames[value] ||
    archiveNames[value] ||
    kindNames[value] ||
    {
      user: "用户记录",
      ai: "AI 建议",
      mixed: "用户记录与 AI 建议",
      legacy: "旧版记录",
      example: "示例",
    }[value] ||
    String(value)
  );
}
export function createStrategyUI(ctx) {
  const { el, icon, commit, toast, openRecord } = ctx;
  const state = () => ctx.state();
  const button = (label, fn, cls = "button small") => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", async (event) => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await fn(event);
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    });
    return b;
  };
  const badge = (text, cls = "") => el("span", "strategy-badge " + cls, text);
  function description(parent, label, value) {
    if (!value) return;
    const section = el("section", "detail-block");
    section.append(el("h3", null, label), el("p", null, value));
    parent.append(section);
  }
  function tags(record) {
    const wrap = el("div", "strategy-tags");
    for (const id of record.directionIds || []) {
      const d = DIRECTIONS.find((d) => d.id === id);
      if (d) {
        const t = badge(d.name);
        t.style.setProperty("--accent", d.color);
        wrap.append(t);
      }
    }
    return wrap;
  }
  function titleOf(collection, id) {
    return state()[collection].find((r) => r.id === id)?.title || id;
  }
  function field(root, label, id, value = "", type = "input", options = null) {
    const wrap = el("label", "field", label),
      input = el(type);
    input.id = id;
    if (type === "textarea") {
      input.rows = 4;
      input.maxLength = 10000;
    } else if (type === "input") input.maxLength = 300;
    if (options) for (const [v, l] of options) input.append(new Option(l, v));
    input.value = value;
    wrap.append(input);
    root.append(wrap);
    return input;
  }
  return {
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
    field,
    display,
  };
}
