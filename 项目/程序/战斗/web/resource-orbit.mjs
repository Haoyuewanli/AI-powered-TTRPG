import {resourceView} from '/resources.mjs';
import {CATEGORY_NAMES,needsSlot,eligibleSlots} from '/action-catalog.mjs';
import {el,glassContents} from '/resource-icons.mjs';
import {actionIcon} from '/action-icons.mjs';
const $=id=>document.getElementById(id);
const categoryIcon={common:'shield',weapons:'sword',unarmed:'fist',spells:'spark',features:'star',items:'bottle',movement:'jump'};
export function resourceOrbit({resources,operations,getState,getActor,openTool}) {
  const dialog=el('dialog','','tool-dialog orbit-dialog');dialog.id='resource-orbit-dialog';dialog.dataset.dialog='resource-orbit';dialog.setAttribute('aria-label','玻璃球资源操作菜单');
  dialog.innerHTML=`<header class="dialog-heading"><div><span class="eyebrow">资源 · 选择操作</span><h2 id="orbit-title"></h2></div><button type="button" class="icon-button" data-close-tool aria-label="关闭球形菜单">×</button></header><div class="dialog-body"><nav id="orbit-breadcrumbs" aria-label="操作分类路径"></nav><div id="orbit-stage" class="orbit-stage" tabindex="0" aria-label="资源操作轨道，左右方向键旋转，拖动或滚轮旋转"><div class="orbit-guide" aria-hidden="true"></div><div id="orbit-ball" class="glass-ball orbit-ball"></div><div id="orbit-cards"></div></div><p id="orbit-empty" class="notice" hidden>当前角色尚未登记此分类的操作。可在“资源与界面设置”中添加已核对的法术、特性或装备。</p><div class="orbit-controls"><button type="button" id="orbit-back">返回上层</button><button type="button" id="orbit-prev" aria-label="向前旋转轨道">←</button><button type="button" id="orbit-next" aria-label="向后旋转轨道">→</button><button type="button" id="orbit-list-toggle">列表模式</button></div><div id="orbit-pages" class="orbit-controls"><button type="button" id="orbit-page-prev">上一页</button><span id="orbit-page-caption" role="status"></span><button type="button" id="orbit-page-next">下一页</button></div><p class="fine">选择图标进入下一层或填写操作参数。浏览、旋转与返回不消耗资源；Esc返回上层，再按可关闭。</p><div id="orbit-list" class="orbit-list" hidden></div></div>`;$('table').append(dialog);
  const stage=$('orbit-stage'),cards=$('orbit-cards'),ball=$('orbit-ball'),memory=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let activeId='',path=[],page=0,theta=0,target=0,frame=0,drag=null,suppressUntil=0,context='',nodes=[],visible=[],opener,freshOrientation=true;
  const count=el('span','','fine');count.id='orbit-count';$('orbit-breadcrumbs').after(count);
  const scope=()=>{const s=getState();return s&&`${s.campaignId}/${s.battleId}/${getActor()?.id}`;};
  const resource=()=>getState()&&getActor()&&resourceView(getState(),getActor()).find(r=>r.id===activeId);
  const key=()=>`${context}/${activeId}/${path.join('/')}`;
  const save=()=>memory.set(key(),{page,theta:target});
  function matches(o,r) {
    if(o.mode==='navigate')return false;
    if(r.id==='movement')return o.category==='movement';
    if(o.mode==='item')return (o.itemResourceIds||[]).some(id=>id===r.id||r.id==='action'&&id==='attack');
    if(['slots','pact'].includes(r.kind))return o.category==='spells' && needsSlot(o,getActor()) && eligibleSlots(getActor(),o).some(s=>s.id===r.id) || o.costs.some(c=>c.resourceId===r.id);
    if(r.id==='action')return o.costs.some(c=>['action','attack'].includes(c.resourceId));
    return o.costs.some(c=>c.resourceId===r.id);
  }
  function build() {
    const r=resource();if(!r)return [];
    const all=operations.catalog().filter(o=>matches(o,r));
    if(!path.length) {
      const categories=Object.keys(CATEGORY_NAMES).filter(c=>all.some(o=>o.category===c) || r.id==='action'&&c==='spells');
      return categories.map(c=>({id:c,name:CATEGORY_NAMES[c],icon:categoryIcon[c],branch:true,path:[c]}));
    }
    let list=all.filter(o=>o.category===path[0]);
    if(path[0]==='spells'&&path.length===1)return [...new Set(list.map(o=>o.spellLevel ?? 0))].sort((a,b)=>a-b).map(level=>({id:`level-${level}`,name:level?`${level}环法术`:'戏法',icon:'spark',branch:true,path:['spells',`level-${level}`]}));
    if(path[0]==='weapons'&&path.length===1) return ['melee','ranged','other'].filter(kind=>list.some(o=>(o.mode==='attack'?(o.icon==='bow'?'ranged':'melee'):'other')===kind)).map(kind=>({id:kind,name:({melee:'近战攻击',ranged:'弓箭与远程',other:'其他武器操作'})[kind],icon:kind==='ranged'?'bow':'sword',branch:true,path:['weapons',kind]}));
    if(path[0]==='spells')list=list.filter(o=>`level-${o.spellLevel??0}`===path[1]);
    if(path[0]==='weapons')list=list.filter(o=>(o.mode==='attack'?(o.icon==='bow'?'ranged':'melee'):'other')===path[1]);
    return list.map(o=>({...o,branch:false}));
  }
  function label(segment) {return CATEGORY_NAMES[segment] || (segment.startsWith('level-')?(segment==='level-0'?'戏法':`${segment.slice(6)}环法术`):({melee:'近战攻击',ranged:'弓箭与远程',other:'其他武器操作'})[segment] || segment);}
  function go(next) {save();path=next;const prior=memory.get(key());page=prior?.page||0;theta=target=prior?.theta||0;freshOrientation=!prior;render();stage.focus({preventScroll:true});}
  function choose(node) {
    if(Date.now()<suppressUntil)return;
    if(node.branch){go(node.path);return;}
    save();dialog.close();operations.choose(node,['slots','pact'].includes(resource()?.kind)?activeId:undefined);
  }
  function makeCard(node,list=false) {
    const b=el('button','',list?'orbit-list-card':'orbit-card');b.type='button';b.dataset.nodeId=node.id;b.dataset.branch=String(node.branch);b.setAttribute('aria-label',`${node.name}${node.branch?'，进入下一层':'，选择操作'}`);
    const square=el('span','','orbit-square');square.append(actionIcon(node.icon));b.append(square,el('span',node.name,'orbit-card-label'));
    if(!node.branch) {const problem=operations.problem(node);b.dataset.unavailable=String(!!problem);b.title=problem||node.notes;b.append(el('small',problem?'查看不可用原因':node.mode==='adjudicate'?'主持裁定':'本地结算'));}
    b.addEventListener('click',()=>choose(node));
    if(!list)b.addEventListener('focus',()=>{if(drag)return;const index=visible.findIndex(n=>n.id===node.id);rotate(-index*Math.PI*2/Math.max(visible.length,1));});
    return b;
  }
  function render() {
    const r=resource();if(!r){dialog.close();return;}
    glassContents(ball,r,resources.preferences);$('orbit-title').textContent=r.name;dialog.style.setProperty('--orbit-color',resources.preferences.resources?.[r.id]?.color||r.color);
    const crumbs=$('orbit-breadcrumbs');crumbs.replaceChildren();for(let i=0;i<=path.length;i++) {const b=el('button',i?label(path[i-1]):r.name);b.type='button';b.addEventListener('click',()=>go(path.slice(0,i)));crumbs.append(b);}
    nodes=build();page=Math.min(page,Math.max(0,Math.ceil(nodes.length/8)-1));visible=nodes.slice(page*8,page*8+8);
    if(freshOrientation&&visible.length===2)theta=target=Math.PI/2;
    freshOrientation=false;count.textContent=`本层 ${nodes.length} 项`;
    cards.replaceChildren(...visible.map(n=>makeCard(n)));$('orbit-list').replaceChildren(...visible.map(n=>makeCard(n,true)));$('orbit-empty').hidden=nodes.length>0;
    $('orbit-back').disabled=!path.length;$('orbit-pages').hidden=nodes.length<=8;$('orbit-page-prev').disabled=page===0;$('orbit-page-next').disabled=(page+1)*8>=nodes.length;$('orbit-page-caption').textContent=`${page+1}/${Math.max(1,Math.ceil(nodes.length/8))}页`;
    paint();
  }
  function paint() {
    const w=stage.clientWidth,h=stage.clientHeight,radius=w*(w<450?.34:.36);
    [...cards.children].forEach((card,i)=>{
      const a=theta+i*Math.PI*2/Math.max(visible.length,1),depth=Math.cos(a),x=Math.sin(a)*radius,y=depth*h*.23-x*.22,scale=.62+(depth+1)*.22;
      card.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${scale}) rotate(${-Math.sin(a)*5}deg)`;
      card.style.zIndex=String(depth<0?Math.round(12+(depth+1)*18):Math.round(80+depth*30));card.style.opacity=String(depth<0?.24+(depth+1)*.4:.78+depth*.22);card.style.filter=depth<0?'brightness(.7)':'none';card.dataset.depth=depth.toFixed(3);
    });stage.dataset.angle=theta.toFixed(4);
  }
  function animate() {frame=0;theta+=(target-theta)*.22;if(Math.abs(target-theta)<.001)theta=target;paint();if(theta!==target)frame=requestAnimationFrame(animate);}
  function rotate(angle) {target=angle;if(reduced.matches){theta=target;paint();}else if(!frame)frame=requestAnimationFrame(animate);save();}
  const step=direction=>rotate(target+direction*Math.PI*2/Math.max(visible.length,3));
  $('orbit-prev').addEventListener('click',()=>step(-1));$('orbit-next').addEventListener('click',()=>step(1));$('orbit-back').addEventListener('click',()=>go(path.slice(0,-1)));
  for(const [id,direction] of [['orbit-page-prev',-1],['orbit-page-next',1]])$(id).addEventListener('click',()=>{page+=direction;theta=target=0;freshOrientation=true;save();render();});
  $('orbit-list-toggle').addEventListener('click',()=>{const list=$('orbit-list');list.hidden=!list.hidden;stage.hidden=!list.hidden;$('orbit-list-toggle').textContent=list.hidden?'列表模式':'球形模式';});
  stage.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();rotate(target+(e.deltaX+e.deltaY)*.004);},{passive:false});
  stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,angle:target,moved:false,pointerId:e.pointerId};});
  stage.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>6){drag.moved=true;stage.setPointerCapture(e.pointerId);e.preventDefault();theta=target=drag.angle+dx*.012;paint();}});
  const finish=()=>{if(drag?.moved){suppressUntil=Date.now()+350;save();}drag=null;};for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,finish);
  stage.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','PageDown','PageUp'].includes(e.key)){e.preventDefault();if(e.key==='Home')rotate(0);else if(e.key.startsWith('Arrow'))step(e.key==='ArrowLeft'?-1:1);else $(e.key==='PageDown'?'orbit-page-next':'orbit-page-prev').click();}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopImmediatePropagation();if(path.length)go(path.slice(0,-1));else{save();dialog.close();opener?.focus({preventScroll:true});}});
  dialog.addEventListener('close',()=>{if(frame)cancelAnimationFrame(frame);frame=0;drag=null;});new ResizeObserver(paint).observe(stage);
  resources.onRender(()=>{if(!dialog.open)return;if(scope()!==context){dialog.close();return;}render();});
  return {open(r,category) {
    opener=document.activeElement;context=scope();activeId=r.id;path=category?[category]:[];const prior=memory.get(key());page=prior?.page||0;theta=target=prior?.theta||0;freshOrientation=!prior;
    openTool('resource-orbit');render();stage.focus({preventScroll:true});
  },clear(){dialog.close();memory.clear();activeId='';path=[];cards.replaceChildren();ball.replaceChildren();$('orbit-list').replaceChildren();$('orbit-breadcrumbs').replaceChildren();$('orbit-title').textContent='';}};
}
