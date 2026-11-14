# 统一任务实施计划
> Execute inline with superpowers:executing-plans, one fresh whole-change review.
Spec: docs/superpowers/specs/2026-11-14-unified-tasks-design.md
Architecture: work-model.mjs handles deterministic legacy projection and task queries. Existing state/import engine remains compatible; plans are retained source materials rather than execution records. Tasks become canonical actions. Native modules/IDB/files backups unchanged.

1. Tests RED first: migrate steps and explicit action plans without losing IDs/content/state; preserve AI proposals as materials; stable mapping, repeated input and deleted-task no-resurrection; v1/v2/v3 export/restore; alias rewrites, invalid project/task references and limits. Implement work-model + normalization/backup contracts.
2. Tests RED first: one task completion across project/task/plan views; task schedule/project edit; source materials and manual conversion; candidates not in active todo. Implement task views, project task rollup/details, timeline and editors; replace old execution plan/step UI; hierarchy includes tasks and separates materials/evidence.
3. Update regression tests for the approved model, preserve durability/concurrency/import/history/security tests. Private old/new import audit and screenshots desktop/mobile. Full Node/types/browser, fresh final review + one regression fix pass, publish authorized site and verify live exact assets.

Review focus: repeated import with aliases/deleted migrated tasks; older backups containing unstructured plans; candidate material conversion; multi-tab task changes and deletion; migration limits and untrusted text; source record preservation and evidence links.
