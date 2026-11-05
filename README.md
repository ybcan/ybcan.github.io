# 战略工作台

个人工作台：https://ybcan.github.io/

学习计划、待办、随手记、常用网站和实验工具集中在一个深色工作空间中。内容保存在当前浏览器，可导出和恢复 JSON 备份；不包含云同步或 AI/ima 自动接入。

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
python3 tests/browser_smoke.py
```

浏览器检查需要 Python Playwright 和 Chromium；云环境已提供。测试运行独立浏览器上下文，不访问个人浏览器数据。
