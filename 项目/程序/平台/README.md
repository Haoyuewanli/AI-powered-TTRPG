> 2026-11-02目录更新：本程序可复用代码在`Code/`。以下直接运行源码的相对命令请进入Code后执行；npm命令仍在本目录执行。

# 平台程序

主平台及文件逻辑要求集中在 [项目README](<../../README.md>)；今后的“平台文件夹”指整个项目根。本目录只存平台程序，战斗程序位于同级 `战斗/`，旧封面管理位于同级 `封面工具/`。

用户入口是项目根 `打开平台.cmd`。本目录也可运行 `node launcher.mjs` 或前台 `node server.mjs`；支持 `RPG_PROJECT_ROOT` 选择项目数据根，默认项目根。新平台只监听本机，按程序和数据根分别识别复用。

- `web/design-workspace.mjs/css`：从最新归档稿恢复完整设计和公共占位示例。
- `appearance-store.mjs`：四尺寸独立本地外观、ETag/版本和前态备份。
- `native-window.mjs/ps1`：Windows独立应用窗外框尺寸，限定已安装Edge、当前资料根/profile/origin及唯一顶层窗口；不接受客户端任意PID、句柄或尺寸。
- `project-files.mjs`、`platform-api.mjs`：资源归档/引用/发放、当前/战斗/对话文件与本机DM能力票据。
- `battle-host.mjs`、`battle-process.mjs`、`battle-projection.mjs`：独立战斗进程、生命周期接线和外置文件投影，不实现机械规则。
- `migrate-storage.mjs`：默认只读预检，明确apply才备份并复制旧存档。
- `cover-api.mjs`：按需接原真实封面工具，保留其安全校验。
- `module-preprocess.mjs`、`module-preprocess-helper.py`：调用本机已有离线PDF工具，生成候选文字、图片和提取报告；不安装工具或发送资料。
- `module-runtime.mjs`：读取已预处理模板，校验原文件摘要，创建独立团副本并接入原战斗核心。语义候选须核对，不能作为自动主持的既定事实。
- `rule-library.mjs`：离线转换不全书条目，保留来源、版本和启用状态；资料导入不等于机械规则已启用。
- `web/map-workspace.mjs/css`：当前模组的地图层级、地点与故事节点、主持信息和团内进度；保存沿用版本冲突保护。

现行目录迁移工具在工作区 `开发记录/工具/重整项目目录.mjs`，默认只生成预检清单。旧 `migrate-storage.mjs` 仅保留历史恢复用途，新目录已有版本标记时拒绝回迁。程序与原始资料位于 `资源/程序`、`资源/资料`；各团的故事、对话、战斗均位于 `模组/团名`。

`npm test` 运行Node检查。浏览器检查使用开发机已有Playwright/Edge，可通过 `RPG_PLATFORM_PLAYWRIGHT_MODULE`、`RPG_PLATFORM_BROWSER` 指定，不是产品运行依赖。测试必须使用隔离合成项目根，不能扫描真实资料。详细结果及交接见工作区现有产品大纲和整理记录。

`node tests/native-window-desktop-check.mjs`会短暂打开两个空白测试窗，测量四预设的真实外框、重开恢复及其他资料根保护，完成后自动关闭。此检查只使用隔离目录，运行期间不要手动关闭测试窗；普通浏览器与独立应用模式的接线另由design-browser-check覆盖。
