import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openWorkspaceStore } from "../docs/workbench/storage.mjs";
import {
  createWorkspace,
  serializeBackup,
} from "../docs/workbench/workspace.mjs";

const memory = (entries = []) => {
  const m = new Map(entries);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
test("legacy migration preserves the original bytes and handles are separate from snapshots", async () => {
  const legacy = memory([
    ["personal-cockpit.workspace.v2", serializeBackup(createWorkspace())],
  ]);
  const store = await openWorkspaceStore({ factory: new IDBFactory(), legacy });
  assert.equal(
    await store.read(),
    legacy.getItem("personal-cockpit.workspace.v2"),
  );
  await store.setAux("setting", { a: 1 });
  assert.deepEqual(await store.getAux("setting"), { a: 1 });
  assert.equal(
    await store.read(),
    legacy.getItem("personal-cockpit.workspace.v2"),
  );
});
test("simultaneous transactions use the latest committed value and rejected changes are atomic", async () => {
  const factory = new IDBFactory(),
    a = await openWorkspaceStore({ factory, legacy: memory() }),
    b = await openWorkspaceStore({ factory, legacy: memory() });
  await a.update(() => '{"n":0}');
  await Promise.all([
    a.update((raw) => JSON.stringify({ n: JSON.parse(raw).n + 1 })),
    b.update((raw) => JSON.stringify({ n: JSON.parse(raw).n + 1 })),
  ]);
  assert.equal(JSON.parse(await a.read()).n, 2);
  await assert.rejects(
    a.update(() => {
      throw Error("invalid");
    }),
    /invalid/,
  );
  assert.equal(JSON.parse(await a.read()).n, 2);
});
test("a working copy larger than 2 MiB can be persisted and reopened", async () => {
  const factory = new IDBFactory(),
    a = await openWorkspaceStore({ factory, legacy: memory() });
  const state = createWorkspace(false);
  state.notes = Array.from({ length: 300 }, (_, i) => ({
    id: "n" + i,
    body: "学".repeat(3000),
    direction: "",
  }));
  const raw = serializeBackup(state);
  assert.ok(new TextEncoder().encode(raw).length > 2 * 1024 * 1024);
  await a.update(() => raw);
  const b = await openWorkspaceStore({ factory, legacy: memory() });
  assert.equal(await b.read(), raw);
});
test("a corrupt legacy snapshot is retained for recovery instead of being initialized as empty", async () => {
  const legacy = memory([["personal-cockpit.workspace.v2", "{broken"]]);
  const store = await openWorkspaceStore({ factory: new IDBFactory(), legacy });
  assert.equal(await store.read(), "{broken");
  assert.equal(legacy.getItem("personal-cockpit.workspace.v2"), "{broken");
});
test("opening an existing working copy never rewrites it from a stale legacy key", async () => {
  const factory = new IDBFactory(),
    legacy = memory([["personal-cockpit.workspace.v2", "legacy"]]);
  const a = await openWorkspaceStore({ factory, legacy });
  await a.update(() => "current");
  let puts = 0;
  const { IDBObjectStore } = await import("fake-indexeddb");
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    puts++;
    return original.apply(this, args);
  };
  try {
    const b = await openWorkspaceStore({ factory, legacy });
    assert.equal(await b.read(), "current");
    assert.equal(puts, 0);
  } finally {
    IDBObjectStore.prototype.put = original;
  }
});
test("a put-success followed by transaction abort is never acknowledged as saved", async () => {
  const factory = new IDBFactory(),
    store = await openWorkspaceStore({ factory, legacy: memory() });
  await store.update(() => "good");
  const { IDBObjectStore } = await import("fake-indexeddb"),
    original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const req = original.apply(this, args);
    req.addEventListener("success", () => req.transaction.abort());
    return req;
  };
  try {
    await assert.rejects(store.update(() => "bad"));
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.equal(await store.read(), "good");
});
