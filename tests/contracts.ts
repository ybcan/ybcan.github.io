import {
  normalizeState,
  parseUpdate,
  prepareUpdate,
} from "../docs/workbench/strategy.mjs";
import { openWorkspaceStore } from "../docs/workbench/storage.mjs";
const state = normalizeState({});
const execution: import("../docs/workbench/types.js").Execution =
  state.projects[0]?.execution;
const packet = parseUpdate("{}");
const preview: Promise<import("../docs/workbench/types.js").ImportPreview> =
  prepareUpdate(state, packet);
const store = openWorkspaceStore();
void execution;
void preview;
void store;
