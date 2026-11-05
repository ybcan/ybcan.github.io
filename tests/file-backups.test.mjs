import test from "node:test";
import assert from "node:assert/strict";
import { FileBackups } from "../docs/workbench/file-backups.mjs";
function directory() {
  const files = new Map();
  return {
    name: "test-directory",
    files,
    permission: "granted",
    fail: false,
    async queryPermission() {
      return this.permission;
    },
    async requestPermission() {
      return this.permission;
    },
    async getFileHandle(name) {
      const owner = this;
      return {
        kind: "file",
        name,
        async getFile() {
          return {
            size: new TextEncoder().encode(files.get(name) || "").length,
            lastModified: 0,
            text: async () => files.get(name) || "",
          };
        },
        async createWritable() {
          let text;
          return {
            write: async (v) => {
              text = v;
            },
            close: async () => {
              if (owner.fail) throw Error("disk");
              files.set(name, text);
            },
            abort: async () => {},
          };
        },
      };
    },
    async *values() {
      for (const name of files.keys()) yield await this.getFileHandle(name);
    },
  };
}
const settings = () => {
  const m = new Map();
  return {
    getAux: async (k) => m.get(k),
    setAux: async (k, v) => {
      m.set(k, v);
    },
  };
};
test("two snapshots get unique files, including within the same millisecond, and can be restored after a new session", async () => {
  const dir = directory(),
    config = settings(),
    a = new FileBackups(config);
  await a.connect(dir);
  await a.write("first");
  await a.write("second");
  assert.equal(dir.files.size, 2);
  const fresh = new FileBackups(config);
  await fresh.init();
  const entries = await fresh.list();
  assert.equal(entries.length, 2);
  assert.deepEqual(
    new Set(await Promise.all(entries.map((e) => fresh.read(e.name)))),
    new Set(["first", "second"]),
  );
});
test("permission denial and failed close never claim backup success or delete older files", async () => {
  const dir = directory(),
    a = new FileBackups(settings());
  await a.connect(dir);
  await a.write("good");
  const last = a.status.lastSuccess;
  dir.fail = true;
  await assert.rejects(a.write("bad"), /disk/);
  assert.equal(a.status.lastSuccess, last);
  assert.equal(dir.files.size, 1);
  dir.permission = "denied";
  await assert.rejects(a.write("no"), /重新连接/);
  assert.equal(dir.files.size, 1);
});
test("existing backups pause automatic writes until the user chooses how to continue", async () => {
  const dir = directory(),
    a = new FileBackups(settings());
  await a.connect(dir);
  await a.write("old");
  const b = new FileBackups(settings());
  await b.connect(dir);
  assert.equal(b.status.state, "choose");
  await assert.rejects(b.write("new"), /选择/);
  assert.equal(dir.files.size, 1);
  await b.enable();
  await b.write("new");
  assert.equal(dir.files.size, 2);
});
test("denying a replacement directory retains the last working backup connection", async () => {
  const good = directory(),
    bad = directory(),
    a = new FileBackups(settings());
  await a.connect(good);
  await a.write("before");
  bad.permission = "denied";
  await assert.rejects(a.connect(bad), /授权/);
  assert.equal(a.directory, good);
  await a.write("after");
  assert.equal(good.files.size, 2);
});
test("unchanged automatic snapshots are skipped across sessions but manual snapshots can be forced", async () => {
  const dir = directory(),
    config = settings(),
    a = new FileBackups(config);
  await a.connect(dir);
  await a.write("same");
  const b = new FileBackups(config);
  await b.init();
  await b.write("same");
  assert.equal(dir.files.size, 1);
  await b.write("same", { force: true });
  assert.equal(dir.files.size, 2);
});
