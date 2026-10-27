import {readFile,copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {atomicJson} from './store.mjs';
import {requireRule,RuleError} from './rule-errors.mjs';
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const color = x => typeof x === 'string' && /^#[\da-f]{6}$/i.test(x);
const key = x => typeof x === 'string' && /^[\w-]{1,100}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
export function validatePreferences(value) {
  requireRule(record(value) && Object.keys(value).every(k => ['resources','layout','hotbars'].includes(k)), '界面设置字段无效');
  requireRule(Buffer.byteLength(JSON.stringify(value)) <= 60000, '界面设置超过60KB，请减少自定义图片');
  if (value.resources !== undefined) {
    requireRule(record(value.resources) && Object.keys(value.resources).length <= 100, '资源外观设置过多');
    for (const [id,r] of Object.entries(value.resources)) {
      requireRule(key(id) && record(r) && Object.keys(r).every(k=>['color','spentColor','image'].includes(k)) && color(r.color) && color(r.spentColor), '资源配色无效');
      if (r.image) {
        requireRule(typeof r.image === 'string' && r.image.length <= 18000 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(r.image), '图片只接受不超过约13KB的PNG');
        const b=Buffer.from(r.image.split(',')[1],'base64');
        requireRule(b.length >= 33 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16)==='IHDR' && b.readUInt32BE(16)>0 && b.readUInt32BE(16)<=128 && b.readUInt32BE(20)>0 && b.readUInt32BE(20)<=128,'图标PNG尺寸须为1～128像素');
      }
    }
  }
  if (value.layout !== undefined) {
    requireRule(record(value.layout) && Object.keys(value.layout).every(k=>['icon','label','count'].includes(k)), '球内布局字段无效');
    for (const p of Object.values(value.layout)) requireRule(record(p) && Object.keys(p).every(k=>['x','y'].includes(k)) && ['x','y'].every(k=>Number.isFinite(p[k]) && p[k]>=10 && p[k]<=90),'球内坐标须为10～90%的相对位置');
  }
  if (value.hotbars !== undefined) {
    requireRule(record(value.hotbars) && Object.keys(value.hotbars).length<=80,'操作格设置过多');
    for (const [id,list] of Object.entries(value.hotbars)) requireRule(key(id) && Array.isArray(list) && list.length<=250 && new Set(list).size===list.length && list.every(s=>typeof s==='string' && /^[\w:-]{1,100}$/.test(s)), '操作格顺序无效');
  }
}
export async function openPreferences(path) {
  let data={formatVersion:1,entries:{}};
  let recoveryNote='';
  try {
    data=JSON.parse(await readFile(path,'utf8'));requireRule(record(data),'界面设置文件格式无效');
    if(data.formatVersion!==1){const e=new RuleError('不支持的界面设置版本；原文件已保留');e.code='UNSUPPORTED_PREFERENCES';throw e;}
    requireRule(record(data.entries),'界面设置条目无效');for(const entry of Object.values(data.entries)){requireRule(record(entry)&&Number.isInteger(entry.revision)&&entry.revision>=0,'界面设置版本无效');validatePreferences(entry.value);}
  }
  catch(e) {
    if(e.code==='UNSUPPORTED_PREFERENCES')throw e;
    if(e instanceof SyntaxError || e instanceof RuleError) {
      await copyFile(path,`${path}.损坏-${randomUUID()}.json`);data={formatVersion:1,entries:{}};
      await atomicJson(path,data);recoveryNote='界面设置文件无效，已保留原件并恢复默认外观；战斗进度未重置。';
    } else if(e.code!=='ENOENT') throw e;
  }
  let queue=Promise.resolve();
  const scope=(principal,campaignId)=>`${campaignId}:${principal.role}:${principal.id}`;
  return {
    recoveryNote,
    get(principal,campaignId) {return structuredClone(data.entries[scope(principal,campaignId)] || {revision:0,value:{}});},
    save(principal,campaignId,payload) {
      const task=queue.then(async()=>{
        const id=scope(principal,campaignId),before=this.get(principal,campaignId);
        requireRule(payload.campaignId===campaignId && payload.expectedRevision===before.revision,'界面设置已变化，请重新打开设置',409);
        validatePreferences(payload.value);
        const entry={revision:before.revision+1,value:payload.value},next=structuredClone(data); next.entries[id]=entry;
        await atomicJson(path,next);data=next;return structuredClone(entry);
      }); queue=task.catch(()=>{});return task;
    }
  };
}
