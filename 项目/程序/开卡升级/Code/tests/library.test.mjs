import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadLibrary, ROOT, pad } from '../library.mjs';
import { markdownPair } from '../render.mjs';
import { evaluate } from '../rules.mjs';
import { parsePlayerMarkdown } from '../../../平台/Code/player-format.mjs';
import { druid } from './fixtures.mjs';
const lib=await loadLibrary();
test('all prebuilt TXT files exist, carry information, and cover each object at every level',async()=>{
  const root=join(ROOT,'TXT库'),manifest=JSON.parse(await readFile(join(root,'索引.json'),'utf8'));
  assert.equal(manifest.sourceHash,lib.hash);assert.equal(manifest.files,3477);
  const expected=new Set(manifest.paths);
  for(const [category,entries] of [['职业',lib.classes],['子职',lib.subclasses],['背景',lib.backgrounds],['种族',lib.species],['专长',lib.feats],['职业法表',lib.classes]])for(const e of entries)for(let n=1;n<=20;n++)assert.ok(expected.has(`${category}/${e.name}/${pad(n)}级.txt`));
  for(let i=0;i<manifest.paths.length;i+=64)await Promise.all(manifest.paths.slice(i,i+64).map(async p=>assert.ok((await stat(join(root,p))).size>40,p)));
  const sample=await readFile(join(root,'职业法表','德鲁伊','12级.txt'),'utf8');assert.ok(sample.includes('准备：16'));assert.ok(sample.includes('施法时间'));assert.ok(sample.includes('持续时间'));
});
test('generated level files pass the existing platform character Markdown parser',()=>{
  const answers=druid(lib),result=evaluate(lib,answers),state={id:'character-synthetic-test',answers,rolls:{},config:{}};
  for(const [name,body] of Object.entries(markdownPair(lib,state,result)))assert.equal(parsePlayerMarkdown(body,name).meta.level,'12级');
});
