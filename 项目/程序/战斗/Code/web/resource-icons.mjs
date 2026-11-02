export const el = (tag, text='', cls='') => { const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n; };
export const DEFAULT_LAYOUT={icon:{x:50,y:39},label:{x:50,y:62},count:{x:50,y:75}};
export function resourceIcon(resource,preferences={},relief=false) {
  const style=preferences.resources?.[resource.id] || {}, root=el('span','','resource-pips');
  root.style.setProperty('--resource-color',style.color || resource.color || '#dabd6e');
  root.style.setProperty('--spent-color',style.spentColor || '#35404d');
  root.dataset.kind=resource.kind;root.dataset.current=String(resource.current);
  if(relief)root.classList.add('relief');
  const max=resource.kind==='movement'?1:Math.min(32,resource.max);
  const remaining=resource.max>32&&resource.kind!=='movement'?Math.ceil(resource.current/resource.max*32):resource.current;
  for(let i=0;i<max;i++) {
    const pip=el('span','','resource-pip'); pip.dataset.shape=resource.kind;pip.dataset.spent=String(i>=remaining);
    if(style.image) {pip.classList.add('image-pip');pip.style.maskImage=`url("${style.image}")`;pip.style.webkitMaskImage=`url("${style.image}")`;}
    root.append(pip);
  }
  if(!max)root.append(el('span','∅','empty-resource'));
  if(resource.max>32&&resource.kind!=='movement')root.append(el('small','等比刻度'));
  root.setAttribute('aria-hidden','true');return root;
}
export function glassContents(ball,resource,preferences={}) {
  ball.replaceChildren();ball.style.setProperty('--glass-color',preferences.resources?.[resource.id]?.color || resource.color);
  const parts={icon:resourceIcon(resource,preferences,true),label:el('strong',resource.name),count:el('span',`${resource.current}/${resource.max}`)};
  for(const [key,node] of Object.entries(parts)) {
    node.dataset.glassPart=key;node.classList.add('glass-part');const p=preferences.layout?.[key] || DEFAULT_LAYOUT[key];node.style.left=`${p.x}%`;node.style.top=`${p.y}%`;ball.append(node);
  }
}
