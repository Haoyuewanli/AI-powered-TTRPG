import { randomUUID } from 'node:crypto';

export const playerSections = {
  '选择.md': ['等级与来源', '新增与替换', '属性、专长与骰点', '待确认'],
  '能力.md': ['基础数值', '能力速查', '法术与专注', '装备、房规与长期增益', '待确认']
};

export function playerMarkdown(filename, { name = '角色名-模组', level = '01级', ...extra } = {}) {
  if (!playerSections[filename]) throw new Error('只支持选择.md或能力.md。');
  const meta = { schemaVersion: 1, id: 'character-' + randomUUID(), name, kind: '角色', level, status: '待填写', ...extra };
  const body = playerSections[filename].map(section => '## ' + section + '\n' + (section === '能力速查'
    ? '|能力|动作|消耗|恢复|效果与DC|来源|\n|---|---|---|---|---|---|'
    : section === '待确认' ? '未填写内容不可视为已选择或已启用。' : '待填写。')).join('\n\n');
  return '---\n' + JSON.stringify(meta, null, 2) + '\n---\n# ' + (filename === '选择.md' ? '本级选择' : '能力与数值') + '\n\n' + body + '\n';
}

export function parsePlayerMarkdown(text, filename) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) fail('请保留JSON前置信息。');
  let meta;
  try { meta = JSON.parse(match[1]); } catch { fail('前置信息JSON无效。'); }
  if (!meta || typeof meta.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(meta.id) || meta.kind !== '角色') fail('角色ID或分类无效。');
  const headings = match[2].split(/\r?\n/).filter(line => line.startsWith('## ')).map(line => line.slice(3).trim());
  if (!playerSections[filename]?.every(section => headings.includes(section))) fail('请保留模版中的固定二级标题。');
  return { meta, body: match[2] };
}
