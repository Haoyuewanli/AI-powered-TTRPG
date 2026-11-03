// A module boundary is its manifest, never its display name or directory depth.
export async function discoverModules({ directories, readManifest }) {
  const modules = [], categories = new Set(), issues = [];
  async function walk(path, category, depth) {
    if (depth > 20) { issues.push({ path, reason: '分类层级过深，已跳过。' }); return; }
    let meta;
    try { meta = await readManifest(path + '/模组.json'); }
    catch (error) {
      if (error.code !== 'ENOENT') { issues.push({ path, reason: error.message }); return; }
    }
    if (meta !== undefined) {
      modules.push({ path, category: category || '未分类', meta });
      categories.add(category || '未分类'); return;
    }
    if (path !== '模组') categories.add(path.slice(3));
    let children;
    try { children = await directories(path); }
    catch (error) { issues.push({ path, reason: '目录暂不可读，请稍后刷新。' }); return; }
    for (const name of children) await walk(path + '/' + name, path === '模组' ? '' : path.slice(3), depth + 1);
  }
  await walk('模组', '', 0);
  return { modules, categories: [...categories].sort(), issues };
}
