// @ts-check
/** Transactional browser working copy; external files provide independent recovery. */
export const DATABASE_NAME = "strategy-workbench";
/** @typedef {{read:()=>Promise<string|null>, update:(change:(raw:string|null)=>string)=>Promise<string>, getAux:(key:string)=>Promise<any>, setAux:(key:string,value:any)=>Promise<void>, available:boolean}} WorkspaceStore */
/** @param {{factory?:IDBFactory,legacy?:Pick<Storage,'getItem'>,name?:string}} options @returns {Promise<WorkspaceStore>} */
export async function openWorkspaceStore(options = {}) {
  const factory = options.factory ?? globalThis.indexedDB,
    legacy = options.legacy ?? globalThis.localStorage;
  if (!factory) throw Error("浏览器工作副本无法打开");
  const db = await new Promise((resolve, reject) => {
    const req = factory.open(options.name ?? DATABASE_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("records");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(Error("请关闭旧标签页后重试"));
  });
  db.onversionchange = () => db.close();
  /** @param {string} key */
  function get(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly"),
        req = tx.objectStore("records").get(key);
      let value;
      req.onsuccess = () => {
        value = req.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? Error("读取失败"));
    });
  }
  /** @param {string} key @param {(value:any)=>any} change */
  function update(key, change) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite"),
        store = tx.objectStore("records"),
        req = store.get(key);
      let value, cause;
      req.onsuccess = () => {
        try {
          value = change(req.result ?? null);
          if (value && typeof value.then === "function")
            throw Error("存储变更必须同步计算");
          store.put(value, key);
        } catch (error) {
          cause = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(cause ?? tx.error ?? Error("保存失败"));
    });
  }
  const store = {
    available: true,
    read: async () => (await get("workspace")) ?? null,
    update: async (change) => update("workspace", change),
    getAux: get,
    setAux: async (key, value) => {
      await update("aux:" + key, () => value);
    },
  };
  // Keep auxiliary keys separate, including directory handles.
  store.getAux = (key) => get("aux:" + key);
  let old = null;
  try {
    old =
      legacy?.getItem("personal-cockpit.workspace.v2") ??
      legacy?.getItem("personal-cockpit.workspace.v1") ??
      null;
  } catch {
    /* IDB remains usable when localStorage is denied. */
  }
  if (old !== null && (await store.read()) === null)
    await store.update((current) => current ?? old);
  return store;
}
/** An explicit volatile fallback: it never claims a browser save succeeded. @param {Pick<Storage,'getItem'>|null} legacy @returns {WorkspaceStore} */
export function volatileStore(legacy = null) {
  let raw = null;
  try {
    raw =
      legacy?.getItem("personal-cockpit.workspace.v2") ??
      legacy?.getItem("personal-cockpit.workspace.v1") ??
      null;
  } catch {}
  return {
    available: false,
    read: async () => raw,
    update: async () => {
      throw Error("浏览器未能保存，请导出备份");
    },
    getAux: async () => null,
    setAux: async () => {
      throw Error("配置无法保存");
    },
  };
}
