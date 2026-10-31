# 模组预处理工具

Node.js 本地工具，无新增依赖。读取已整理的中间数据，不调用模型、不推断图像身份或规则版本。模组正文、图片、中间数据和派生包都留在被忽略的本地目录，不能随工具提交。

在工作区根执行：

```powershell
node 开发记录/工具/模组预处理/validate-package.mjs --self-test
node 开发记录/工具/模组预处理/test-tools.mjs
```

前者检查独立契约及失败退出码，后者用另一部合成模组检查生成、审核台脚本和审核保护。后者的 DOM 替身不能证明图片在浏览器中解码、实际下载或双击打开正常。合成现场保留在命令输出的临时目录。

## 下一本模组

先运行 `index-input.mjs` 和 `index-resources.mjs`，参数见各脚本开头。为新模组创建独立批次目录及中间数据，按 r3 契约整理内容。不要改通用脚本中的模组名称。

`model-meta.json` 包含 `meta`、`chapters`、`rulesVersionIssues`，以及这些生成配置：

| 字段 | 用途 |
| --- | --- |
| `meta.moduleId / batchId / title / category / sourceVersion / inputMd` | 模组、批次与输入身份 |
| `meta.targetRules / capabilities / externalEvidence` | 本批真实规则目标与核对能力，不因工具能运行而声称内容已确认 |
| `nodeFiles` | 节点文件名数组，按顺序拼接各文件的 `nodes` |
| `coverSourceName` | 输入盘点中实际图片的名称；输出封面扩展名须保持真实格式 |
| `warnings / overviewCapabilityLines / overviewUsageLines` | 本批警告和概览文字，均由本地数据提供 |

其余文件是 `model-maps.json`（maps、locationCandidates）、`model-encounters.json`（encounters、dialogues）、`model-resources.json`（newResources、resourceMatching、resourceCandidates、resourceBodies）、`model-images.json`（images）、`model-coverage.json`（coverage）。字段沿用 r3；`resourceBodies` 是 `{资源ID: Markdown正文}`，不能为空。

资源匹配每个稳定 ID 一条。`idExists: true` 只说明文件实体存在；`contentStatus` 为 confirmed 或 pending；`versionStatus` 为 none 或 conflict。`decision` 为 confirmed-reuse、new、pending、conflict，summary 从条目计算。版本冲突可以保留已确认的故事身份和旧 ID，但不能据此启用其机械规则。资源内容未确认时留在 resourceCandidates，不能进入 resourceIds。

已确认地点资源的图像绑定仍可待定：地图写 `resourceBindingStatus: candidate`，候选关联注明 `scope: image-binding`；它与资源身份确认是两件事。尚未确认内容的候选用 `scope: content`。历史判定可保留在 previousDecision、previousEvidence，不能冒充当前判定。

## 命令顺序

以下变量由操作者指定为本机路径，`$moduleRel` 是相对项目根的最终模组目录；`$packageRoot` 是包含这一相对目录的根，不是模组目录本身。

```powershell
node 开发记录/工具/模组预处理/build-package.mjs --project-root $projectRoot --input-dir $inputDir --inventory $inventory --model-dir $modelDir --stage-dir $stageRoot --module-rel $moduleRel --cover-name $coverName

$checkArgs = @('--project-root',$projectRoot,'--package-dir',$packageRoot,'--module-rel',$moduleRel,'--inventory',$inventory,'--resources-index',$resourcesIndex,'--stage-root',$stageRoot,'--mode','staging')
node 开发记录/工具/模组预处理/validate-package.mjs @checkArgs --write-results
# 首次没有审核台时，此处应退出1，并写出失败报告。检查其他失败原因，不能把这次算作通过。
node 开发记录/工具/模组预处理/build-review-console.mjs --project-root $projectRoot --package-dir $packageRoot --module-rel $moduleRel --inventory $inventory --out-dir $reviewDir
node 开发记录/工具/模组预处理/validate-package.mjs @checkArgs --write-results
# 重建一次审核台，更新其中的检查快照；随后检查与输出清单对应当前文件。
node 开发记录/工具/模组预处理/build-review-console.mjs --project-root $projectRoot --package-dir $packageRoot --module-rel $moduleRel --inventory $inventory --out-dir $reviewDir
node 开发记录/工具/模组预处理/validate-package.mjs @checkArgs --write-results --write-manifest
```

校验失败退出1，缺少参数或不支持的模式退出2。检查结果区分 blockingErrors、pendingHuman 和 warnings；结构通过不改变 candidate，也不清除内容待审核项。

`land-package.mjs` 只用于新目标。已有文件会整批拒绝，包括同名人工审核文件；本轮未扩展为更新器。落盘后以 projectRoot 同时作为 packageRoot，mode 改 final，再按上述顺序生成审核台并校验。不要用落盘命令更新已有包，已有包的局部修订应先备份、记录摘要，只替换明确授权的派生文件。

## 人工审核与恢复

双击模组的 `校验/审核台.html`，查看地图和完整节点，按章筛选，选择“通过/需改/无法判断”并填写备注，导出 `人工审核.json`。人工文件是正式记录，浏览器缓存只作草稿；缓存按模组、批次和预处理.json 的 SHA256 隔离，不再读取旧的固定缓存名。

导出文件包含 schemaVersion、moduleId、batchId、packageSha256，以及 kind/id/choice/note 条目。保存回原校验目录后，可直接重新运行校验。只有真实用户操作才能保存人工结论。初始旧格式空记录仍兼容，非空记录必须带完整身份；错误模组、批次、旧包摘要、未知/重复 ID 或非法选择均失败。审核“通过”也不会自动启用资源或删除 pendingHuman。

生成器发现非空审核会在写入前停止；请保留原目录，以新阶段区生成并另行复核。生成器和审核台生成器均不覆盖已有人工审核文件。预处理.json 改变后旧审核会被识别为过期，不能改摘要强行沿用；先保留旧文件，再由用户重新核对。

当前边界：工具不做故事语义复核、地图视觉确认、规则版本选择或平台导入。真实浏览器交互需另外实测。目录/文件路径与版本字段继续沿用现有契约，后续扩展新审核种类时需同时更新条目校验、审核台和合成样例。
