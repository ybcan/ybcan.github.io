import * as legacy from "./workspace-v1.mjs?v=20261105-strategy2";
import {
  createStrategyState,
  normalizeState,
  migrateLegacy,
  clearExamples,
} from "./strategy.mjs?v=20261105-strategy2";
export {
  DIRECTIONS,
  safeUrl,
  textStatistics,
  formatJson,
  FocusClock,
} from "./workspace-v1.mjs?v=20261105-strategy2";
export const STORAGE_KEY = "personal-cockpit.workspace.v2";
export const LEGACY_STORAGE_KEY = legacy.STORAGE_KEY;
export const createWorkspace = createStrategyState;
export const validateWorkspace = normalizeState;
export const removeExamples = clearExamples;
const LIMIT = 2 * 1024 * 1024;
export function serializeBackup(state) {
  const raw = JSON.stringify(
    {
      format: "personal-cockpit",
      version: 2,
      exportedAt: new Date().toISOString(),
      data: normalizeState(state),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(raw).length > LIMIT)
    throw Error("工作区已达到 2 MB 上限，请先备份并整理部分内容");
  return raw;
}
export function parseBackup(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > LIMIT)
    throw Error("备份文件不能超过 2 MB");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("备份不是有效的 JSON 文件");
  }
  if (value?.format !== "personal-cockpit" || ![1, 2].includes(value.version))
    throw Error("这不是受支持的个人驾驶舱备份");
  return value.version === 1
    ? migrateLegacy(legacy.parseBackup(raw))
    : normalizeState(value.data);
}
export function loadWorkspace(storage) {
  let raw, old;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) old = storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { state: createWorkspace(), status: "unavailable" };
  }
  if (raw === null && old === null)
    return { state: createWorkspace(), status: "new" };
  try {
    return {
      state: parseBackup(raw ?? old),
      status: raw === null ? "migrated" : "saved",
      raw: raw ?? undefined,
    };
  } catch {
    return {
      state: createWorkspace(false),
      status: "corrupt",
      raw: raw ?? old,
    };
  }
}
export function saveWorkspace(storage, state) {
  const raw = serializeBackup(state);
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
