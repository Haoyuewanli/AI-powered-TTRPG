import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RESOURCES = resolve(ROOT, '../../资源');
export const VERSION = 'character-builder-2024-v1';
export const abilities = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
export const skills = {运动:'力量',体操:'敏捷',巧手:'敏捷',隐匿:'敏捷',奥秘:'智力',历史:'智力',调查:'智力',自然:'智力',宗教:'智力',驯兽:'感知',洞悉:'感知',医药:'感知',察觉:'感知',求生:'感知',欺瞒:'魅力',威吓:'魅力',表演:'魅力',游说:'魅力'};
export const digest = value => createHash('sha256').update(value).digest('hex');
export const shortName = value => value.split(/[｜|]|\s+[A-Za-z]/)[0].trim();
export const safeName = value => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100);
export const pad = n => String(n).padStart(2, '0');
const categories = ['职业', '背景', '种族', '专长', '法术', '物品', '怪物', '怪物图鉴'];
const numeral = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};

export async function loadLibrary(resources = RESOURCES) {
  const entries = [];
  for (const category of categories) {
    let files;
    try { files = await readdir(join(resources, category)); } catch (e) { if(e.code==='ENOENT') continue; throw e; }
    for (const file of files.filter(f => f.endsWith('.md') && f !== '示例模版.md').sort()) {
      const raw = await readFile(join(resources, category, file), 'utf8');
      const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!match) continue;
      const meta = JSON.parse(match[1]);
      const appendixBeast = meta.source?.book === '怪物图鉴2025' && meta.source?.navigation?.includes('玩家手册2024') && /野兽/.test(match[2].slice(0,500));
      if (meta.source?.book !== '玩家手册2024' && !appendixBeast) continue;
      const body = match[2].split('## 资料正文')[1]?.split('## 来源与使用边界')[0]?.trim();
      if (!body) continue;
      const e = { id:meta.id, name:shortName(meta.name), title:meta.name, category,
        kind:meta.data?.ruleCategory, body, tables:meta.data?.content?.tables || [],
        source:meta.source.path, hash:digest(raw), revision:meta.source.revision, file:join(resources, category, file), meta };
      if (e.kind === 'spell') {
        e.spellLevel = Number(meta.source.path.match(/\/(\d)环/)?.[1]);
        if (!Number.isInteger(e.spellLevel)) e.spellLevel = numeral[body.match(/([零一二三四五六七八九])环/)?.[1]] ?? (/戏法/.test(body) ? 0 : NaN);
        e.classes = (body.match(/(?:环|戏法)\s*[^\n（(]*[（(]([^）)]+)[）)]/)?.[1] || '').split(/[、，,]/).map(x=>x.trim());
        e.school = body.match(/(?:环|戏法)\s*(防护|咒法|预言|惑控|塑能|幻术|死灵|变化)/)?.[1];
      }
      if (e.kind === 'class' || e.kind === 'subclass') e.className = meta.source.path.match(/角色职业\/([^/]+)\//)?.[1];
      // The fixed source has one missing </tr> between Wizard levels 3 and 4.
      if(e.kind==='class' && e.name==='法师') {
        const rows=e.tables[1]?.rows, i=rows?.findIndex(r=>r[0]==='3' && r.length>20);
        if(i>=0) { const r=rows[i], split=r.findIndex(c=>/— 4$/.test(c)); if(split>=0) rows.splice(i,1,[...r.slice(0,split),'—'],['4',...r.slice(split+1)]); }
      }
      entries.push(e);
    }
  }
  const unique = new Map();
  for(const e of entries) if(!unique.has(e.id)) unique.set(e.id,e);
  const all = [...unique.values()];
  const lib = { entries:all, hash:digest(all.map(e=>e.id+e.hash).sort().join('\n')), version:VERSION,
    classes:all.filter(e=>e.kind==='class'), subclasses:all.filter(e=>e.kind==='subclass'),
    backgrounds:all.filter(e=>e.kind==='background'), species:all.filter(e=>e.kind==='species'),
    feats:all.filter(e=>e.kind==='feat'), spells:all.filter(e=>e.kind==='spell'), equipment:all.filter(e=>e.kind==='equipment'),
    beasts:all.filter(e=>/beast|creature|monster/.test(e.kind||'') && /野兽/.test(e.body.slice(0,250))) };
  if(lib.classes.length!==12 || lib.backgrounds.length!==16 || lib.species.length!==10 || lib.spells.length<300) throw new Error('本地2024资料不齐全，请恢复项目/资源中的固定版本资料后重试。');
  if(lib.spells.some(e=>!Number.isInteger(e.spellLevel)||!e.classes.length)) throw new Error('部分法术无法识别环阶或职业列表，资料库构建已停止。');
  lib.find = (kind, value) => findEntry(lib[kind] || all, value);
  return lib;
}

export function findEntry(entries, value) {
  if (!value) return null;
  const normalize = s => s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const key = normalize(value);
  const alias = {'盗贼':'游荡者','邪术师':'魔契师','吟游诗人':'吟游诗人','毒气喷溅':'毒气喷涌'};
  const hits = entries.filter(e=>[e.name,e.title,e.title.split(/[｜|]/).at(-1),e.title.match(/[A-Za-z].*$/)?.[0],e.id].filter(Boolean).some(n=>normalize(n)===key || normalize(n)===normalize(alias[value]||'##')));
  if(hits.length===1)return hits[0];
  if(hits.length>1 && hits.every(e=>e.name===hits[0].name&&e.kind===hits[0].kind))return hits.sort((a,b)=>b.body.length-a.body.length)[0];
  return null;
}

export function classProgression(entry, level) {
  const table = entry.tables.find(t => t.rows.some(r=>r.includes('等级') && r.some(c=>/熟练/.test(c))));
  if(!table) throw new Error('缺少职业成长表：'+entry.name);
  const row = table.rows.find(r=>r[0]===String(level));
  if(!row) throw new Error('缺少职业等级：'+entry.name+' '+level);
  const header = table.rows[0];
  return {row,header,table};
}

export function spellCapacity(entry, level) {
  const {row,header} = classProgression(entry, level);
  const number = label => {const i=header.findIndex(c=>c.includes(label)); return i<0?0:Number(row[i])||0;};
  const cantrips = number('戏法'), prepared = number('准备法术');
  const slotIndex = header.findIndex(c=>/每环法术位/.test(c));
  let slots = slotIndex>=0 ? row.slice(slotIndex,slotIndex+9).map(v=>Number(v)||0) : [];
  if(entry.name==='魔契师') {
    const count = number('法术位'), text=row[header.findIndex(c=>/法术位环阶/.test(c))] || '';
    const rank=Number(text)||numeral[text[0]]||0;
    slots=Array(9).fill(0);if(rank)slots[rank-1]=count;
  }
  return {cantrips, prepared, slots, maxSpell:slots.findLastIndex(n=>n>0)+1};
}

export function info(entry) { return entry.title+'\n\n'+entry.body+'\n'; }
export function overview(entries) { return entries.map((e,i)=>`${i+1}. ${info(e)}`).join('\n\n'); }

export async function buildLibrary(lib, destination = join(ROOT, 'TXT库')) {
  await mkdir(destination, {recursive:true});
  const files = [];
  async function put(parts, content) {
    const relative = parts.join('/'), path=join(destination,...parts);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,content.replace(/\r?\n/g,'\r\n'),'utf8');files.push(relative);
  }
  const groups = [['职业',lib.classes],['子职',lib.subclasses],['背景',lib.backgrounds],['种族',lib.species],['专长',lib.feats]];
  for(const [group,entries] of groups) {
    await put(['总览',group+'.txt'],overview(entries));
    for(const e of entries) for(let level=1;level<=20;level++) {
      let intro=`${e.title} · ${level}级资料\n\n`;
      if(e.kind==='class') {
        const p=classProgression(e,level);
        intro+=`本级成长表：${p.row.join(' / ')}\n表头：${p.header.join(' / ')}\n\n`;
      }
      intro+='下文保留完整规则供比较；写明获得等级的能力只在达到等级后生效。\n\n';
      await put([group,safeName(e.name),pad(level)+'级.txt'],intro+info(e));
    }
  }
  for(const c of lib.classes) for(let level=1;level<=20;level++) {
    const cap=spellCapacity(c,level);
    const list=lib.spells.filter(s=>s.classes.includes(c.name)&&s.spellLevel<=cap.maxSpell).sort((a,b)=>a.spellLevel-b.spellLevel||a.name.localeCompare(b.name,'zh-CN'));
    await put(['职业法表',safeName(c.name),pad(level)+'级.txt'],`${c.name} ${level}级基础职业法表\n戏法：${cap.cantrips}；常规准备：${cap.prepared}；额外来源另算。\n法术位：${cap.slots.join(' / ')||'无'}\n子职、专长等可能开放额外法术，见对应资料。\n\n`+overview(list));
  }
  for(let rank=0;rank<=9;rank++) await put(['法术',rank===0?'戏法.txt':rank+'环.txt'],overview(lib.spells.filter(e=>e.spellLevel===rank)));
  await put(['总览','装备.txt'],overview(lib.equipment));
  await put(['总览','野兽形态.txt'],overview(lib.beasts));
  const manifest={version:VERSION,sourceHash:lib.hash,classes:lib.classes.length,subclasses:lib.subclasses.length,backgrounds:lib.backgrounds.length,species:lib.species.length,feats:lib.feats.length,spells:lib.spells.length,beasts:lib.beasts.length,files:files.length,paths:files,sources:lib.entries.map(e=>({id:e.id,path:e.source,hash:e.hash}))};
  await writeFile(join(destination,'索引.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
