# 战略工作台

个人工作台：https://ybcan.github.io/

以长期目标组织学习、实践项目与研究，保留问答归档、完成历史、随手记、待办和实验工具。内容保存在当前浏览器，可导出和恢复 JSON 备份；不包含云同步或 AI/ima 自动接入。

## 站点文件

- `docs/index.html`：战略工作台首页。
- `docs/workbench/`：CSS 与原生 JavaScript 模块。
- `docs/blog.html`：保留的旧博客首页。
- `docs/posts/` 等目录：原有文章和博客资源，继续保留。

GitHub Pages 沿用 `master` 分支的 `/docs` 发布来源。更新网站时推送这些静态文件即可，不需要运行 Hugo。重新执行旧 Hugo 构建可能覆盖工作台首页，发布前应检查 `docs/index.html`。

## 本地运行

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

## 检查

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p strategy_browser.py
```

浏览器检查需要 Python Playwright 和 Chromium；云环境已提供。测试运行独立浏览器上下文，不访问个人浏览器数据。

## 战略关联版

- 首页展示长期目标，点选目标可筛选其学习、实践和研究事项。一个事项可关联多个目标和方向。
- 候选规划的采纳状态与实际执行状态独立。采纳不会自动开始或生成日程。
- 积累与归档保留题目、回答、AI 点评、单题评分、关键总结和下一问题；完成历史收录完成的事项和步骤。
- 学习讨论继续在 ChatGPT 中进行。来源分别保存分享链接与原对话链接；未提供原对话时仅显示分享记录。
- 设置中的“合并聊天归档”预览增量更新；“恢复备份”用于完整替换，两者独立。归档更新按稳定 ID 匹配，支持手工映射，冲突默认保留本地。
- 新版使用独立的 v2 本地存储，保留旧版 v1 原始键。首次读取旧记录后，下次保存写入 v2；旧版页面的新修改不会自动同步到新版，可导出旧备份后处理。
- 快照及归档更新文件限制为 2 MiB。导入保存失败时保留预览；普通编辑未能保存时会提示导出本页数据。

个人聊天、计划及归档包不应提交到公开仓库。公开示例和测试只使用通用内容。

归档更新 JSON 格式为 `strategy-workbench-update`、`version: 1`，包含 `batchId` 和 `records`。`records` 可包含 goals、projects、plans、archives、sources 及原有六类记录。增量包不是完整备份；引用的目标、事项和来源须已存在或与本次更新一起选中。字段定义和校验见 `docs/workbench/strategy.mjs`，脱敏用例见 `tests/strategy.test.mjs`。
