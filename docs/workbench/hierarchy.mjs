// @ts-check
export const PARENT_TYPES = {
  projects: ["goals", "projects"],
  plans: ["goals", "projects", "plans"],
  archives: ["goals", "projects", "plans"],
};
/** @param {string} collection @param {any} record @returns {{collection:string,id:string}|null} */
export function parentOf(collection, record) {
  if (collection === "goals") return null;
  if (record.parentRef) return record.parentRef;
  if (collection === "archives" && record.projectId)
    return { collection: "projects", id: record.projectId };
  if (collection !== "projects" && record.itemIds?.length)
    return { collection: "projects", id: record.itemIds[0] };
  if (record.goalIds?.length)
    return { collection: "goals", id: record.goalIds[0] };
  return null;
}
/** Resolve a record's main goal without making its secondary goal links into duplicates. @param {any} state @param {any} record */
export function primaryGoalId(state, record) {
  return createGoalResolver(state)(record);
}
/** Index once per immutable workspace render, memoizing ancestor paths. @param {any} state */
export function createGoalResolver(state) {
  const index = new Map(),
    cache = new Map(),
    collections = new Map();
  for (const c of ["goals", "projects", "plans", "archives"])
    for (const r of state[c]) {
      index.set(c + ":" + r.id, { c, r });
      collections.set(r, c);
    }
  /** @param {any} record */
  return (record) => {
    const c = collections.get(record);
    let parent = c
      ? { collection: c, id: record.id }
      : record.parentRef ||
        (record.projectId
          ? { collection: "projects", id: record.projectId }
          : record.itemIds?.length
            ? { collection: "projects", id: record.itemIds[0] }
            : record.goalIds?.length
              ? { collection: "goals", id: record.goalIds[0] }
              : null);
    const path = new Set();
    let goal = "";
    while (parent) {
      const key = parent.collection + ":" + parent.id;
      if (cache.has(key)) {
        goal = cache.get(key);
        break;
      }
      if (parent.collection === "goals") {
        goal = parent.id;
        break;
      }
      if (path.has(key)) break;
      path.add(key);
      const node = index.get(key);
      if (!node) break;
      parent = parentOf(node.c, node.r);
    }
    for (const key of path) cache.set(key, goal);
    return goal;
  };
}
/** @typedef {{key:string,collection:string,id:string,record:any,reference:boolean,targetKey:string,children:TreeNode[]}} TreeNode */
/** Pure display index. Bodies remain in canonical workspace records; references never copy children. @param {any} state @param {(record:any,collection:string)=>boolean} predicate @returns {TreeNode[]} */
export function buildHierarchy(state, predicate = () => true) {
  /** @type {Map<string,TreeNode>} */ const nodes = new Map();
  const parents = new Map();
  for (const collection of ["goals", "projects", "plans", "archives"])
    for (const record of state[collection]) {
      const key = collection + ":" + record.id;
      nodes.set(key, {
        key,
        collection,
        id: record.id,
        record,
        reference: false,
        targetKey: "",
        children: [],
      });
    }
  const roots = [];
  const unassigned = {
    key: "group:unassigned",
    collection: "group",
    id: "unassigned",
    record: { title: "未归属" },
    reference: false,
    targetKey: "",
    children: [],
  };
  for (const node of nodes.values()) {
    const parent = parentOf(node.collection, node.record),
      parentKey = parent ? parent.collection + ":" + parent.id : null;
    if (node.collection === "goals") roots.push(node);
    else if (parentKey && nodes.has(parentKey)) {
      nodes.get(parentKey).children.push(node);
      parents.set(node.key, parentKey);
    } else {
      unassigned.children.push(node);
      parents.set(node.key, unassigned.key);
    }
  }
  if (unassigned.children.length) {
    nodes.set(unassigned.key, unassigned);
    roots.push(unassigned);
  }
  const keep = new Set();
  const retainPath = (key) => {
    const seen = new Set();
    while (key && !keep.has(key)) {
      if (seen.has(key)) throw Error("归属不能形成环");
      seen.add(key);
      keep.add(key);
      key = parents.get(key);
    }
  };
  for (const node of nodes.values())
    if (node.collection !== "group" && predicate(node.record, node.collection))
      retainPath(node.key);
  const resolveGoal = createGoalResolver(state);
  for (const collection of ["projects", "plans", "archives"])
    for (const record of state[collection]) {
      if (!record.goalIds?.length) continue;
      const key = collection + ":" + record.id;
      if (!keep.has(key)) continue;
      const primary = resolveGoal(record);
      for (const goal of record.goalIds || []) {
        if (goal === primary) continue;
        const owner = nodes.get("goals:" + goal);
        if (!owner) continue;
        const reference = {
          key: "ref:" + goal + ":" + key,
          collection,
          id: record.id,
          record,
          reference: true,
          targetKey: key,
          children: [],
        };
        owner.children.push(reference);
        nodes.set(reference.key, reference);
        retainPath(reference.key);
        retainPath(owner.key);
      }
    }
  for (const node of nodes.values())
    node.children = node.children.filter((c) => keep.has(c.key));
  return roots.filter((n) => keep.has(n.key));
}
