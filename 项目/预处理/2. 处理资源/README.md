# 第二轮：处理资源

原始MD和图片来自`../0. 待处理模组/<模组>/`；PDF只由人类准备，本轮不读取。通用程序放Code，输出放本目录输出，每批使用新目录，不覆盖原件或旧结果。

## 固定MD格式

每个条目的正文是一份MD，开头为`---`、JSON对象、`---`，随后是Markdown正文。JSON必须包含稳定id、name、与目录名一致的kind、A～Z initial；模组资源填写moduleId。source记录原文路径、版本、摘要和行范围；edition区分规则家族和出版年。data只保存结构化补充，不保存团内HP或玩家授权。reviewStatus保持candidate，enabled默认false。

每个分类下有示例模版.md；复制后改名和稳定ID，模板本身不进入卡片。图片使用本地相对路径；模组配图可集中在资源/图片，不按文件名猜测它的用途。

## 复用流程

1. 按原文标题及内容填写资源计划，合并资料卡的特质、动作和装备小标题，避免一张卡拆成互不完整的条目。地点原文可以作为地点资源，但地图图像与画布由第一轮提供。
2. 计划JSON包含moduleId、version、rulesFamily、sourceSha256、mapImages，以及resources数组；每项包含id、name、kind、initial、start、end（原文1开始的闭区间），可附aliases/tags/mapNodeIds。
3. 程序按范围原样取正文、复制非地图配图、生成分类模板与来源清单；缺图和外部图保留问题，不联网下载。检查可读正文、完整资料卡、重复身份及图片，再复制结果到正式模组。

从工作区执行：

```powershell
node "项目/预处理/2. 处理资源/Code/build-resources.mjs" --input "项目/预处理/0. 待处理模组/某模组" --md "原文.md" --plan "资源计划.json" --out "项目/预处理/2. 处理资源/输出/新批次"
node --test "项目/预处理/2. 处理资源/Code/tests/*.test.mjs"
```

世界资料转换另用`Code/convert-world.mjs --project 项目 --expect-count 5010`预检，加`--apply`才写入。目标不同内容或来源变更会拒绝全批覆盖；同内容重跑跳过并核对。该工具复用已有不全书提取结果，不重新读取PDF/HTML或自动启用规则。

风骸岛本批为`输出/风骸岛-v1436-r2-verified/`，195条、29配图；计划和清单保留。已复制至正式风骸岛模组，与第一轮地图输出分开。此前196条批次保留作历史，最终合并了+1武器的属性小标题，防止拆成两个条目。
