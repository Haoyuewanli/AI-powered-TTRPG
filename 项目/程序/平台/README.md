# 平台程序

主平台及文件逻辑要求集中在 [项目README](../../README.md)；今后的“平台文件夹”指整个项目根。本目录只存平台程序，战斗程序位于同级 `战斗/`，旧封面管理位于同级 `封面工具/`。

用户入口是项目根 `打开平台.cmd`。本目录也可运行 `node launcher.mjs` 或前台 `node server.mjs`；支持 `RPG_PROJECT_ROOT` 选择项目数据根，默认项目根。新平台只监听本机，按程序和数据根分别识别复用。

- `web/design-workspace.mjs/css`：从最新归档稿恢复完整设计和公共占位示例。
- `appearance-store.mjs`：四尺寸独立本地外观、ETag/版本和前态备份。
- `project-files.mjs`、`platform-api.mjs`：资源归档/引用/发放、当前/战斗/对话文件与本机DM能力票据。
- `battle-host.mjs`、`battle-process.mjs`、`battle-projection.mjs`：独立战斗进程、生命周期接线和外置文件投影，不实现机械规则。
- `migrate-storage.mjs`：默认只读预检，明确apply才备份并复制旧存档。
- `cover-api.mjs`：按需接原真实封面工具，保留其安全校验。

`npm test` 运行Node检查。浏览器检查使用开发机已有Playwright/Edge，可通过 `RPG_PLATFORM_PLAYWRIGHT_MODULE`、`RPG_PLATFORM_BROWSER` 指定，不是产品运行依赖。测试必须使用隔离合成项目根，不能扫描真实资料。详细结果及交接见工作区现有产品大纲和整理记录。
