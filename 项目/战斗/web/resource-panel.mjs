import {resourceView} from '/resources.mjs';
import {el,resourceIcon,glassContents,DEFAULT_LAYOUT} from '/resource-icons.mjs';
const $=id=>document.getElementById(id);
export function resourcePanel({api,action,getState,getActor,notify,openTool,onResource=()=>{}}) {
  const root=el('section','','resource-section');root.id='resource-section';root.setAttribute('aria-label','资源与操作');
  const heading=el('div','','resource-heading'),settings=el('button','资源与界面设置');settings.type='button';settings.id='resource-settings';
  heading.append(el('h3','资源'),settings);const row=el('div','','resource-row');row.id='resource-row';root.append(heading,row);$('actor-info').after(root);
  const dialog=el('dialog','','tool-dialog');dialog.id='resource-settings-dialog';dialog.dataset.dialog='resource-settings';dialog.setAttribute('aria-label','资源与界面设置');
  dialog.innerHTML=`<header class="dialog-heading"><h2>资源与界面设置</h2><button type="button" class="icon-button" data-close-tool aria-label="关闭资源设置">×</button></header><div class="dialog-body">
  <p class="fine">外观和操作格顺序保存到主持电脑的界面设置文件，按团与身份分开。资源数值属于本场角色资料。</p>
  <form id="resource-style-form"><h3>图标颜色与图片</h3><label>资源<select id="style-resource"></select></label><div class="fields two"><label>可用颜色<input id="style-active" type="color"></label><label>消耗颜色<input id="style-spent" type="color"></label></div><label>导入透明底纯色图标<input id="style-image" type="file" accept="image/png,image/webp"></label><p class="fine">PNG / WebP，自动缩为96像素并按透明度生成纯色图标。图片只保存到本机；颜色由上方配色控制。</p><button type="button" id="style-clear">清除本资源图片</button>
  <h3>玻璃球内图文位置</h3><p class="fine">拖动预览中的图标、名称和数量。键盘也可用下方坐标调整，单位为球体宽高的百分比。</p><div id="glass-layout-preview" class="glass-ball layout-preview"></div><div id="glass-layout-fields" class="fields three"></div><button id="layout-reset" type="button">恢复图文默认位置</button><button class="primary" id="save-resource-style">保存界面设置</button></form>
  <section id="resource-data-settings"><h3>本场资源资料 · 主持核对</h3><p class="fine">只添加角色实际拥有的资源。普通法术位和契约法术位分开；旧资源备注不会自动转成资源池。恢复量填all、整数，留空表示不自动恢复；长休不会隐含触发短休配置。</p><label>已有资源<select id="pool-choice"></select></label>
  <form id="pool-form"><div class="fields two"><label>ID<input id="pool-id" pattern="[A-Za-z0-9_-]{1,60}" required maxlength="60"></label><label>名称<input id="pool-name" required maxlength="80"></label><label>类型<select id="pool-kind"><option value="pool">次数 / 点数</option><option value="slots">普通法术位</option><option value="pact">契约法术位</option><option value="dice">资源骰池</option><option value="rolls">预掷结果</option><option value="inventory">库存 / 激活数</option></select></label><label>环级 / 骰面<input id="pool-detail" type="number" value="1" min="1" max="100"></label><label>剩余<input id="pool-current" type="number" min="0" max="1000" required></label><label>上限<input id="pool-max" type="number" min="0" max="1000" required></label><label>短休恢复<input id="pool-short" placeholder="例：1"></label><label>长休恢复<input id="pool-long" placeholder="例：all"></label><label>本人回合开始恢复<input id="pool-turn" placeholder="通常留空"></label><label>预掷结果（逗号分隔）<input id="pool-values"></label></div><label>已核对的规则来源与条件<input id="pool-source" required maxlength="1000" placeholder="例：PHB2024 德鲁伊 荒野形态；短休1次，长休全部"></label><button class="primary">保存本场资源资料</button><button id="pool-remove" type="button">移出本场资源</button></form>
  <details><summary>资源JSON批量编辑</summary><p class="fine">沿用同一资料校验；可用于导入已核对角色的多个资源。</p><textarea id="pools-json" rows="8" spellcheck="false"></textarea><button type="button" id="pools-apply">应用资源JSON</button></details>
  <div class="fields two"><label>休息类型<select id="rest-kind"><option value="short">短休</option><option value="long">长休</option></select></label><label>休息依据<input id="rest-reason" placeholder="确认时长、安全环境及恢复条件"></label></div><button id="record-rest" type="button">记录选中角色休息</button></section></div>`;
  $('table').append(dialog);
  let prefs={revision:0,value:{}},scope='',loadPromise,styleId='',image='',draft={},layout=structuredClone(DEFAULT_LAYOUT),renderExtras=()=>{};
  const safe=fn=>async e=>{e?.preventDefault();try{await fn(e);}catch(err){notify(err.message,true);}};
  function resource() {return resourceView(getState(),getActor()).find(r=>r.id===$('style-resource').value);}
  function render() {
    const state=getState(),actor=getActor();root.hidden=!state||!actor||!('hp' in actor);if(root.hidden)return;
    row.replaceChildren(...resourceView(state,actor).map(r=>{
      const b=el('button','','resource-button');b.type='button';b.dataset.resourceId=r.id;b.setAttribute('aria-label',`${r.name} ${r.current}/${r.max}，打开操作分类`);b.title=`${r.name} ${r.current}/${r.max}${r.source ? ` · ${r.source}`:''}`;
      b.append(resourceIcon(r,prefs.value),el('span',r.name),el('small',`${r.current}/${r.max}`));b.addEventListener('click',()=>onResource(r));return b;
    }));renderExtras();
  }
  async function update() {
    const state=getState();if(!state)return;
    const next=`${state.campaignId}/${state.viewerId}/${state.viewRole}`;
    if(scope!==next) {
      scope=next;prefs={revision:0,value:{}};
      const current=scope;
      loadPromise=api('/api/preferences').then(result=>{if(scope===current){prefs=result;render();}}).catch(e=>{if(scope===current)notify(e.message,true);});
    }
    render();
  }
  async function save(value) {
    await loadPromise;const current=scope;
    const result=await api('/api/preferences',{campaignId:getState().campaignId,expectedRevision:prefs.revision,value});
    if(current!==scope)return;prefs=result;render();notify('界面设置已保存到本机');
  }
  function preview() {const r=resource();if(r)glassContents($('glass-layout-preview'),r,{...draft,layout});}
  function captureStyle() {
    if(!styleId)return;draft.resources ??={};draft.resources[styleId]={color:$('style-active').value,spentColor:$('style-spent').value,...(image?{image}:{})};
  }
  function fillStyle() {
    styleId=$('style-resource').value;const r=resource(),s=draft.resources?.[styleId] || {};image=s.image||'';$('style-active').value=s.color||r?.color||'#dabd6e';$('style-spent').value=s.spentColor||'#35404d';$('style-image').value='';preview();
  }
  function layoutFields() {
    const fields=$('glass-layout-fields');fields.replaceChildren();
    for(const [part,label] of [['icon','图标'],['label','名称'],['count','数量']]) {
      const field=el('fieldset');field.append(el('legend',label));
      for(const axis of ['x','y']) {const l=el('label',axis.toUpperCase()),i=el('input');i.type='number';i.min=10;i.max=90;i.step=1;i.value=layout[part][axis];i.dataset.layoutPart=part;i.dataset.axis=axis;i.addEventListener('input',()=>{layout[part][axis]=Math.max(10,Math.min(90,Number(i.value)));preview();});l.append(i);field.append(l);} fields.append(field);
    }
  }
  const previewBall=$('glass-layout-preview');let drag;
  previewBall.addEventListener('pointerdown',e=>{const n=e.target.closest('[data-glass-part]');if(!n)return;drag=n.dataset.glassPart;previewBall.setPointerCapture(e.pointerId);e.preventDefault();});
  previewBall.addEventListener('pointermove',e=>{if(!drag)return;const b=previewBall.getBoundingClientRect();layout[drag]={x:Math.round(Math.max(10,Math.min(90,(e.clientX-b.left)/b.width*100))),y:Math.round(Math.max(10,Math.min(90,(e.clientY-b.top)/b.height*100)))};preview();layoutFields();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])previewBall.addEventListener(type,()=>{drag=null;});
  settings.addEventListener('click',safe(async()=>{
    await loadPromise;draft=structuredClone(prefs.value);layout=structuredClone({...DEFAULT_LAYOUT,...draft.layout});
    $('style-resource').replaceChildren(...resourceView(getState(),getActor()).map(r=>{const o=el('option',r.name);o.value=r.id;return o;}));fillStyle();layoutFields();fillPools();openTool('resource-settings');
  }));
  $('style-resource').addEventListener('change',()=>{captureStyle();fillStyle();});
  for(const id of ['style-active','style-spent'])$(id).addEventListener('input',()=>{captureStyle();preview();});
  $('style-clear').addEventListener('click',()=>{image='';captureStyle();preview();});
  $('layout-reset').addEventListener('click',()=>{layout=structuredClone(DEFAULT_LAYOUT);preview();layoutFields();});
  $('style-image').addEventListener('change',safe(async()=>{
    const file=$('style-image').files[0];if(!file)return;if(!['image/png','image/webp'].includes(file.type)||file.size>1024*1024)throw new Error('请选择1MB以内的PNG / WebP透明图标');
    const bitmap=await createImageBitmap(file);if(bitmap.width>4096||bitmap.height>4096){bitmap.close();throw new Error('图片尺寸不能超过4096像素');}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const c=canvas.getContext('2d'),scale=Math.min(88/bitmap.width,88/bitmap.height);c.drawImage(bitmap,(96-bitmap.width*scale)/2,(96-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
    const pixels=c.getImageData(0,0,96,96);let transparent=0,visible=0;for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i+3]<10)transparent++;if(pixels.data[i+3]>10)visible++;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}if(!transparent||!visible)throw new Error('图标须含透明背景和可见图案');c.putImageData(pixels,0,0);image=canvas.toDataURL('image/png');captureStyle();preview();
  }));
  $('resource-style-form').addEventListener('submit',safe(async()=>{captureStyle();draft.layout=layout;await save(draft);}));
  function fillPools(selected='') {
    const a=getActor();$('resource-data-settings').hidden=getState().viewRole!=='dm';
    $('pool-choice').replaceChildren(el('option','新增资源'),...(a.resourcePools||[]).map(r=>{const o=el('option',r.name);o.value=r.id;return o;}));$('pool-choice').options[0].value='';$('pool-choice').value=selected;
    $('pools-json').value=JSON.stringify(a.resourcePools||[],null,2);fillPool();
  }
  function fillPool() {
    const p=getActor().resourcePools?.find(r=>r.id===$('pool-choice').value);
    for(const key of ['id','name','kind','current','max','source'])$(`pool-${key}`).value=p?.[key] ?? ({kind:'pool',current:0,max:0}[key] ?? '');
    $('pool-id').readOnly=!!p;$('pool-detail').value=p?.level||p?.sides||1;$('pool-values').value=(p?.values||[]).join(',');for(const k of ['short','long','turn'])$(`pool-${k}`).value=p?.recovery?.[k] ?? '';
  }
  $('pool-choice').addEventListener('change',fillPool);
  $('pool-form').addEventListener('submit',safe(async()=>{
    const a=getActor(),r={id:$('pool-id').value,name:$('pool-name').value,kind:$('pool-kind').value,current:Number($('pool-current').value),max:Number($('pool-max').value),source:$('pool-source').value,recovery:{}};
    if(['slots','pact'].includes(r.kind))r.level=Number($('pool-detail').value);if(r.kind==='dice')r.sides=Number($('pool-detail').value);if(r.kind==='rolls')r.values=$('pool-values').value.split(',').filter(s=>s.trim()).map(Number);
    for(const k of ['short','long','turn']){const v=$(`pool-${k}`).value.trim();if(v)r.recovery[k]=v==='all'?v:Number(v);}
    const pools=structuredClone(a.resourcePools||[]),index=pools.findIndex(p=>p.id===r.id);if(index>=0)pools[index]=r;else pools.push(r);
    await action('edit-actor',{actorId:a.id,patch:{resourcePools:pools},reason:'主持核对结构化资源'});fillPools(r.id);
  }));
  $('pool-remove').addEventListener('click',safe(async()=>{const a=getActor(),id=$('pool-choice').value;if(!id)return;await action('edit-actor',{actorId:a.id,patch:{resourcePools:(a.resourcePools||[]).filter(r=>r.id!==id)},reason:'主持移出资源资料'});fillPools();}));
  $('pools-apply').addEventListener('click',safe(async()=>{await action('edit-actor',{actorId:getActor().id,patch:{resourcePools:JSON.parse($('pools-json').value)},reason:'主持导入已核对资源'});fillPools();}));
  $('record-rest').addEventListener('click',safe(()=>action('rest',{actorId:getActor().id,kind:$('rest-kind').value,reason:$('rest-reason').value})));
  return {update,clear(){scope='';prefs={revision:0,value:{}};row.replaceChildren();dialog.close();root.hidden=true;},get preferences(){return prefs.value;},save,get root(){return root;},onRender(fn){renderExtras=fn;}};
}
