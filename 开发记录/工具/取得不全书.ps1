$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$libraryRoot = Join-Path $workspaceRoot '项目\资源\资料\5E不全书'
$source = Get-Content -LiteralPath (Join-Path $libraryRoot '来源.json') -Raw -Encoding utf8 | ConvertFrom-Json
$originals = Join-Path $libraryRoot '原始发布'
New-Item -ItemType Directory -Force -Path $originals | Out-Null

foreach ($entry in @($source.chm, $source.web)) {
    $destination = Join-Path $originals $entry.filename
    if (-not (Test-Path -LiteralPath $destination)) {
        $partial = $destination + '.part'
        if (Test-Path -LiteralPath $partial) { throw "存在未完成下载，先检查而不覆盖：$partial" }
        Invoke-WebRequest -Uri $entry.url -OutFile $partial -TimeoutSec 120
        if ((Get-Item -LiteralPath $partial).Length -ne $entry.bytes -or
            (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
            throw "文件校验不一致，已保留下载现场：$partial"
        }
        Move-Item -LiteralPath $partial -Destination $destination
    }
    if ((Get-Item -LiteralPath $destination).Length -ne $entry.bytes -or
        (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        throw "已有文件不匹配，拒绝覆盖：$destination"
    }
}

$treeFile = Join-Path $originals $source.web.tree_filename
if (-not (Test-Path -LiteralPath $treeFile)) {
    $tree = Invoke-RestMethod -Uri $source.web.tree_url -TimeoutSec 60
    if ($tree.truncated) { throw 'GitHub 返回了被截断的清单' }
    $tree | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $treeFile -Encoding utf8
}
$webRoot = Join-Path $libraryRoot '网页'
if (-not (Test-Path -LiteralPath $webRoot) -or @(Get-ChildItem -LiteralPath $webRoot -Force).Count -eq 0) {
    & python (Join-Path $PSScriptRoot '核对不全书.py') --extract
} else {
    & python (Join-Path $PSScriptRoot '核对不全书.py')
}
if ($LASTEXITCODE -ne 0) { throw '不全书核对未通过，未显示为成功' }
