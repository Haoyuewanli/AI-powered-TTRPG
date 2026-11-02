> 2026-11-02目录更新：本程序可复用代码在`Code/`。以下直接运行源码的相对命令请进入Code后执行；npm命令仍在本目录执行。

# 模组封面工具

本工具从旧 `项目/平台/` 迁入，保留已经完成的真实目录读取、PNG/JPG显示和集中裁切管理。主入口现在由[平台程序](<../平台/README.md>)负责；本目录不再启动战斗宿主，也不替代平台的模组选择。

在平台首页选择本机DM视角，到模组页打开“管理真实模组封面”。选择图片后点“切割封面”，可以完整显示或调整3:4裁切；明确保存才更新模组根目录的 `cover-crops.json`，原图不改。取消和Esc不写入，返回平台继续使用同一个本机视角会话。

默认管理 `项目/模组/预处理/故事/模组/模组封面.png` 或 `.jpg`，从预处理文件读取标题，裁切集中保存到该故事根的 `cover-crops.json`。也兼容显式 `RPG_MODULES_ROOT` 指定的旧 `分类/模组` 素材库。目录和模组可读名称不受本工具修改。浏览器入口 `/module-covers`，脚本及样式仍为 `/module-covers.mjs`、`/module-covers.css`，服务端分别映射到本目录web文件。

## 接口与保护

全部资料接口先由平台服务核对本机DM会话；页面使用 `sessionStorage` 的 `platform-session`，请求头 `X-Platform-Session`。Player公共预览和没有有效会话的窗口不能读取目录或图片。工具不创建自己的登录，不使用战斗会话，不在URL存令牌。

- `GET /api/module-covers`：分类、模组、封面和配置摘要。
- `GET /api/module-covers/image?moduleId=…`：按已发现ID读取图片，不接受任意路径。
- `POST /api/module-covers`：沿用 `moduleId`、`expectedConfigRevision`、`expectedCoverRevision`、`mode` 和可选 `crop`，核对配置及源图摘要后原子更新。

后台由平台的 `cover-api.mjs` 按需加载本目录 `src/module-library.mjs`。旧图片验证、写锁、并发冲突和原图保护逻辑保持；复用战斗程序的原子JSON写入工具，不导入业务状态。图片和配置链接不能越过根目录，PNG/JPG单图上限16MB，未知锁及坏JSON保留原件。

本工具的ID按封面所在目录定位素材，不是平台永久模组业务ID；正式模组仍以模组调用JSON的显式ID为准。封面裁切不创建团、不改变所属模组，不写战斗进度或资源。

## 检查

在本目录运行：

```powershell
node --test tests/module-library.test.mjs
node tests/browser-check.mjs
```

检查只使用 `开发记录/临时/` 中的合成图片与目录。浏览器脚本使用本机已有Playwright和Edge；它们是检查工具，不是产品依赖。浏览器七组保留无会话/Player隔离、平台真实入口往返、横版PNG/JPG、裁切保存、配置/源图冲突以及390/320窄屏与重开恢复。

旧 `web/platform-shell.*` 和 `web/dialogue-workspace.*` 随目录保留供历史接线核对，当前平台不加载这四个文件；正在使用的完整UI、示例和对话组件位于 `资源/程序/平台/web/`，后续开发以那里为准。
