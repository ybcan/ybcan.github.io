// @ts-check
import { MAX_BACKUP_BYTES } from "#workbench/limits";
/** @typedef {{getAux:(key:string)=>Promise<any>,setAux:(key:string,value:any)=>Promise<void>}} Settings */
/** A versioned, append-only backup directory. Permission prompts require an explicit user gesture. */
export class FileBackups {
  /** @param {Settings} settings */
  constructor(settings) {
    this.settings = settings;
    /** @type {any} */ this.directory = null;
    this.enabled = false;
    this.status = {
      state: "disconnected",
      message: "尚未连接备份目录",
      lastSuccess: "",
    };
    this.tail = Promise.resolve();
    this.fingerprint = "";
    this.lastFile = "";
    this.generation = 0;
  }
  async init() {
    const config = await this.settings.getAux("backup");
    if (config) {
      this.directory = config.directory;
      this.fingerprint = config.fingerprint || "";
      this.lastFile = config.lastFile || "";
      this.enabled = config.enabled;
      this.status.lastSuccess = config.lastSuccess || "";
      await this.check();
    }
    return this.status;
  }
  async saveConfig() {
    await this.settings.setAux("backup", {
      directory: this.directory,
      enabled: this.enabled,
      lastSuccess: this.status.lastSuccess,
      fingerprint: this.fingerprint,
      lastFile: this.lastFile,
    });
  }
  /** @param {any} directory */
  async connect(directory) {
    if (!directory) throw Error("未选择目录");
    const previous = {
      directory: this.directory,
      enabled: this.enabled,
      status: { ...this.status },
      fingerprint: this.fingerprint,
      lastFile: this.lastFile,
    };
    try {
      const permission = await directory.queryPermission({ mode: "readwrite" });
      if (
        permission !== "granted" &&
        (await directory.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw Error("需要重新连接并授权备份目录");
      this.generation++;
      this.directory = directory;
      this.fingerprint = "";
      this.lastFile = "";
      this.status.lastSuccess = "";
      const existing = await this.list();
      this.enabled = existing.length === 0;
      this.status.state = this.enabled ? "ready" : "choose";
      this.status.message = this.enabled
        ? "目录已连接"
        : "目录中有历史备份，请先选择恢复或保留当前内容";
      await this.saveConfig();
      return existing;
    } catch (error) {
      this.directory = previous.directory;
      this.enabled = previous.enabled;
      this.status = previous.status;
      this.fingerprint = previous.fingerprint;
      this.lastFile = previous.lastFile;
      throw error;
    }
  }

  async enable() {
    this.enabled = true;
    await this.check();
    await this.saveConfig();
  }
  async check() {
    if (!this.directory) {
      this.status.state = "disconnected";
      return false;
    }
    try {
      if (
        (await this.directory.queryPermission({ mode: "readwrite" })) !==
        "granted"
      ) {
        this.status.state = "permission";
        this.status.message = "备份目录需要重新连接授权";
        return false;
      }
    } catch {
      this.status.state = "permission";
      this.status.message = "备份目录不可访问，请重新连接";
      return false;
    }
    this.status.state = this.enabled ? "ready" : "choose";
    return this.enabled;
  }
  /** @param {string} raw @param {{force?:boolean}} options */
  async write(raw, options = {}) {
    const operation = async () => {
      const generation = this.generation,
        directory = this.directory;
      const hash = async (text) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(text),
            ),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      if (!this.enabled) throw Error("请先选择恢复旧备份或保留当前内容");
      if (!(await this.check())) throw Error("备份目录需要重新连接");
      if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
        throw Error("备份超过 32 MiB");
      const fingerprint = await hash(raw);
      if (generation !== this.generation) throw Error("目录已变更，请重新备份");
      if (!options.force && fingerprint === this.fingerprint && this.lastFile) {
        try {
          const file = await (
            await directory.getFileHandle(this.lastFile)
          ).getFile();
          if (
            file.size <= MAX_BACKUP_BYTES &&
            (await hash(await file.text())) === fingerprint
          ) {
            this.status.message = "当前工作副本已有独立备份";
            return this.lastFile;
          }
        } catch {}
      }
      const name =
        "strategy-workbench-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        crypto.randomUUID() +
        ".json";
      let writable;
      try {
        const file = await directory.getFileHandle(name, { create: true });
        writable = await file.createWritable();
        await writable.write(raw);
        await writable.close();
        if (generation !== this.generation) return name;
        this.fingerprint = fingerprint;
        this.lastFile = name;
        this.status.lastSuccess = new Date().toISOString();
        this.status.state = "ready";
        this.status.message = "已写入独立备份文件";
        await this.saveConfig();
        return name;
      } catch (error) {
        try {
          await writable?.abort();
        } catch {}
        this.status.state = "error";
        this.status.message =
          "文件备份失败：" +
          (error instanceof Error ? error.message : String(error));
        throw error;
      }
    };
    const job = this.tail.then(operation, operation);
    this.tail = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  async list() {
    if (!this.directory) return [];
    const entries = [];
    for await (const file of this.directory.values()) {
      if (
        file.kind === "file" &&
        /^strategy-workbench-[\w.-]+\.json$/.test(file.name)
      )
        entries.push({ name: file.name });
    }
    return entries.sort((a, b) => b.name.localeCompare(a.name));
  }
  /** @param {string} name */
  async read(name) {
    if (!/^strategy-workbench-[\w.-]+\.json$/.test(name))
      throw Error("备份文件名无效");
    const file = await (await this.directory.getFileHandle(name)).getFile();
    if (file.size > MAX_BACKUP_BYTES) throw Error("备份超过 32 MiB");
    return file.text();
  }
  async disconnect() {
    this.generation++;
    this.directory = null;
    this.enabled = false;
    this.status.state = "disconnected";
    this.status.message = "已断开，已有备份文件保留";
    await this.saveConfig();
  }
}
