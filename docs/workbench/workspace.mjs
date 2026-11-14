import * as legacy from "#workbench/workspace-v1";
import {
  createStrategyState,
  normalizeState,
  migrateLegacy,
  clearExamples,
} from "#workbench/strategy";
export {
  DIRECTIONS,
  safeUrl,
  textStatistics,
  formatJson,
  FocusClock,
} from "#workbench/workspace-v1";
export const STORAGE_KEY = "personal-cockpit.workspace.v2";
export const LEGACY_STORAGE_KEY = legacy.STORAGE_KEY;
export const createWorkspace = createStrategyState;
export const validateWorkspace = normalizeState;
export const removeExamples = clearExamples;
import { MAX_BACKUP_BYTES, MAX_LEGACY_BYTES } from "#workbench/limits";
const LIMIT = MAX_BACKUP_BYTES;
export function serializeBackup(state) {
  const raw = JSON.stringify(
    {
      format: "personal-cockpit",
      version: 3,
      exportedAt: new Date().toISOString(),
      data: normalizeState(state),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(raw).length > LIMIT)
    throw Error("工作区已达到 32 MiB 上限，请先备份并整理部分内容");
  return raw;
}
export function parseBackup(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > LIMIT)
    throw Error("备份文件不能超过 32 MiB");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("备份不是有效的 JSON 文件");
  }
  if (value?.format !== "personal-cockpit" || ![1, 2, 3].includes(value.version))
    throw Error("这不是受支持的个人驾驶舱备份");
  return value.version === 1
    ? migrateLegacy(value.data)
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
  if (new TextEncoder().encode(raw).length > MAX_LEGACY_BYTES)
    throw Error("旧版 localStorage 存储超过 2 MiB，请使用新版工作副本");
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
