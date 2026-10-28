import { snapObject } from '/map-placement.mjs';
const $ = id => document.getElementById(id);
const presets = { tile: { name: '地图地板', size: [10, 10, .5] }, wall: { name: '墙', size: [15, 1, 8], blocks: true }, hill: { name: '隆起', size: [15, 15, 5] },
  floor: { name: '二楼平台', size: [20, 20, 1], y: 9 }, stairs: { name: '楼梯', size: [5, 15, 10] }, prop: { name: '道具', size: [3, 3, 3], blocks: true } };
export function terrainPanel({ action, getState, notify, canEdit }) {
  let selected = '', key = '', dirty = false, editRevision = null, multi = [];
  const editing = () => getState()?.viewRole === 'dm' && !document.getElementById('scene-tools').hidden && document.getElementById('scene-tools').dataset.tool === 'terrain';
  const options = () => ({step: Number($('map-snap').value), edges: $('map-edges').checked, height: $('map-height').checked});
  function idsFor(id) { const item=getState().objects.find(o=>o.id===id); return multi.includes(id) ? multi : item?.groupId ? getState().objects.filter(o=>o.groupId===item.groupId).map(o=>o.id) : [id]; }
  function selectObject(id) { if (dirty) { notify('请先保存或放弃地形表单编辑', true); return false; } selected=id; fill(object()); render(getState()); return true; }
  const guard = fn => async event => { event?.preventDefault(); try { await fn(); } catch (error) { notify(error.message, true); } };
  const object = () => getState()?.objects?.find(o => o.id === selected);
  function fill(item) {
    $('terrain-shape').value = item.shape || 'box';
    $('terrain-name').value = item.name; $('terrain-type').value = item.type;
    for (const k of ['x', 'y', 'z']) $(`terrain-${k}`).value = item.position[k];
    for (const k of ['width', 'depth', 'height']) $(`terrain-${k}`).value = item.size[k];
    $('terrain-rotation').value = item.rotation; $('terrain-hidden').checked = !!item.hidden; $('terrain-blocks').checked = !!item.blocksMovement;
    editRevision = getState()?.revision; dirty = false; $('terrain-dirty').textContent = '';
  }
  function preset() {
    const type = $('terrain-type').value, p = presets[type];
    fill({ type, name: p.name, position: { x: 25, y: p.y || 0, z: 25 }, size: { width: p.size[0], depth: p.size[1], height: p.size[2] }, rotation: 0, hidden: false, blocksMovement: !!p.blocks });
  }
  function values() {
    return { shape: $('terrain-shape').value, name: $('terrain-name').value, type: $('terrain-type').value,
      position: Object.fromEntries(['x', 'y', 'z'].map(k => [k, Number($(`terrain-${k}`).value)])),
      size: Object.fromEntries(['width', 'depth', 'height'].map(k => [k, Number($(`terrain-${k}`).value)])),
      rotation: Number($('terrain-rotation').value), hidden: $('terrain-hidden').checked, blocksMovement: $('terrain-blocks').checked };
  }
  $('terrain-select').addEventListener('change', () => { selected = $('terrain-select').value; object() ? fill(object()) : preset(); render(getState()); });
  $('terrain-type').addEventListener('change', () => { if (!selected) preset(); });
  $('terrain-form').addEventListener('input', () => { dirty = true; $('terrain-dirty').textContent = '未保存'; });
  $('terrain-form').addEventListener('change', () => { dirty = true; $('terrain-dirty').textContent = '未保存'; });
  $('terrain-form').addEventListener('submit', guard(async () => {
    if (!canEdit()) return;
    if (selected) await action('edit-object', { objectId: selected, patch: values() }, editRevision);
    else { await action('add-object', values()); selected = getState().objects.at(-1).id; }
    dirty = false; fill(object()); render(getState());
  }));
  $('terrain-new').addEventListener('click', () => { selected = ''; preset(); render(getState()); });
  $('terrain-reload').addEventListener('click', () => { object() ? fill(object()) : preset(); });
  $('terrain-copy').addEventListener('click', guard(async () => {
    if (!canEdit() || !object()) return;
    await action('add-object', { ...values(), name: `${$('terrain-name').value} 副本` }); selected = getState().objects.at(-1).id; dirty = false; fill(object()); render(getState());
  }));
  $('terrain-remove').addEventListener('click', guard(async () => {
    if (!canEdit() || !selected) return;
    await action('remove-object', { objectId: selected }); selected = ''; dirty = false; preset(); render(getState());
  }));
  $('board-form').addEventListener('submit', guard(async () => {
    if (!canEdit()) return;
    await action('edit-board', { width: Number($('board-width').value), depth: Number($('board-depth').value), extended: $('board-extended').checked, baseEnabled: $('board-base').checked });
  }));
  $('terrain-place-mode').addEventListener('change', () => { if ($('terrain-place-mode').checked) $('place-mode').checked = false; });
  $('place-mode').addEventListener('change', () => { if ($('place-mode').checked) $('terrain-place-mode').checked = false; });
  function render(state) {
    if (!state) return;
    $('terrain-panel').hidden = state.viewRole !== 'dm';
    if (state.viewRole !== 'dm') return;
    if (!document.activeElement?.closest('#board-form')) { $('board-width').value = state.board.width; $('board-depth').value = state.board.depth; $('board-extended').checked = !!state.board.extended; $('board-base').checked = state.board.baseEnabled !== false; }
    $('board-form').querySelector('button').disabled = state.combat.phase === 'active';
    const next = state.battleId + '/' + JSON.stringify(state.objects);
    if (key !== next) {
      key = next;
      if (selected && !object()) { selected = ''; dirty = false; }
      const option = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
      $('terrain-select').replaceChildren(option('', '新物件（选择类型后保存）'), ...(state.objects || []).map(o => option(o.id, `${o.name}${o.hidden ? ' · DM隐藏' : ''}`)));
      multi=multi.filter(id=>state.objects.some(o=>o.id===id));
      $('map-multi').replaceChildren(...state.objects.map(o=>{const n=option(o.id, `${o.name}${o.groupId?' · 组':''}`);n.selected=multi.includes(o.id);return n;}));
      $('terrain-select').value = selected;
      if (!dirty && !$('map-stamp').checked) object() ? fill(object()) : preset();
    }
    $('map-selection-note').textContent = selected ? `已选：${object()?.name} · 拖动将操作${idsFor(selected).length}件` : '选中物件可拖动；选择工具可连续放置';
    $('terrain-select').value = selected;
    $('terrain-save').textContent = selected ? '保存物件修改' : '添加到本场战斗';
    for (const id of ['terrain-copy', 'terrain-remove']) $(id).disabled = !selected;
  }
  document.querySelectorAll('[data-brush]').forEach(button => button.addEventListener('click', () => {
    if (dirty) { notify('请先保存或放弃地形表单编辑', true); return; }
    selected=''; const kind=button.dataset.brush; if(['cube1','tile1'].includes(kind))$('map-snap').value='1';if(['cube5','tile5'].includes(kind))$('map-snap').value='5';
    const cube=kind.startsWith('cube'), tileUnit=['tile1','tile5'].includes(kind), unit=kind.endsWith('1')?1:5;
    fill({ type:cube||kind==='ramp'?'prop':'tile', name:button.textContent, shape:kind==='circle'?'cylinder':kind==='triangle'?'triangle':kind==='ramp'?'ramp':'box', position:{x:25,y:0,z:25},size:cube||tileUnit?{width:unit,depth:unit,height:cube?unit:.5}:{width:10,depth:10,height:kind==='ramp'?5:.5},rotation:0,hidden:false,blocksMovement:cube });
    $('map-stamp').checked=true;$('terrain-place-mode').checked=false;$('place-mode').checked=false;render(getState());
  }));
  $('map-multi').addEventListener('change',()=>{multi=[...$('map-multi').selectedOptions].map(o=>o.value);if(multi.length&&!dirty){selected=multi[0];fill(object());}render(getState());});
  for(const operation of ['group','ungroup']) $(`map-${operation}`).addEventListener('click',guard(async()=>{if(!canEdit()||dirty)throw new Error('请先保存表单'); const ids=multi.length?multi:selected?idsFor(selected):[];await action('transform-objects',{operation,ids});}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')$('map-stamp').checked=false;});
  return { render,
    editing,
    accepts(item) { return editing() && ($('map-layer').value==='all' || ($('map-layer').value==='tile')===(item.type==='tile')); },
    select: selectObject,
    selectedIds: () => selected ? idsFor(selected) : [],
    stamping: () => editing() && $('map-stamp').checked,
    canDrag: () => editing() && !dirty && canEdit(),
    destination(item, point, lockZ) { return snapObject(item,point,getState().objects,{...options(),exclude:idsFor(item.id),lockZ}); },
    async drop(id, position, context, copy) {
      if (!canEdit() || dirty) throw new Error('请先保存或放弃编辑');
      const state=getState();if(state.battleId!==context.battleId||state.campaignId!==context.campaignId||state.revision!==context.revision)throw new Error('局面已更新，请重新拖动');
      const item=state.objects.find(o=>o.id===id); if(!item)throw new Error('物件已不存在');
      await action('transform-objects',{ids:idsFor(id),operation:copy?'copy':'move',delta:Object.fromEntries(['x','y','z'].map(a=>[a,position[a]-item.position[a]]))},context.revision);
    },
    get dirty() { return dirty; },
    async place(point) {
      if (editing() && $('map-stamp').checked) {
        if (!canEdit()) return true;
        const item=values(); item.position=snapObject(item,{x:point.x,y:item.position.y,z:point.z},getState().objects,options());
        await action('add-object',item); return true;
      }
      if (!$('terrain-place-mode').checked) return false;
      if (!selected) throw new Error('请先添加并选择一个物件，再点击空地摆放');
      if (dirty) throw new Error('请先保存或放弃地形表单编辑，再点击摆放');
      if (!canEdit()) return true;
      await action('edit-object', { objectId: selected, patch: { position: { x: Math.round(point.x * 2) / 2, y: object().position.y, z: Math.round(point.z * 2) / 2 } } }); return true;
    },
    clear() { selected = ''; key = ''; dirty = false; multi=[]; $('map-stamp').checked=false; $('map-multi').replaceChildren(); editRevision = null; $('terrain-select').replaceChildren(); $('terrain-place-mode').checked = false; $('terrain-dirty').textContent = ''; }
  };
}
