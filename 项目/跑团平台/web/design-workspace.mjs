// Migrated from 开发记录/平台设计/platform-covers.html; sample content stays in memory.
const markup = String.raw`<div id="platform-covers" aria-label="平台首页、模组与资源交互设计">
  <div class="p-app" data-app>
    <div class="p-atmosphere" aria-hidden="true"><div class="p-wall"><div class="p-beam"></div></div><div class="p-ground"><div class="p-floor-light"></div><div class="p-floor-shade"></div><div class="p-floor-contact"></div><div class="p-object-shadows"></div></div></div>

    <aside class="p-side"><div class="p-brand"><span class="p-brand-mark" aria-hidden="true"></span>战局</div><p class="p-edition">D&D 2024</p><nav class="p-nav" aria-label="平台导航">
      <button type="button" class="p-nav-button p-button cursor-interaction" data-page="首页" data-platform-page="home" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10 12 3l9 7"></path><path d="M5 9v12h5v-7h4v7h5V9"></path></svg><span>首页</span></button>
      <button type="button" class="p-nav-button p-button cursor-interaction" data-page="模组" data-platform-page="modules" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v16"></path><path d="M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"></path></svg><span>模组</span></button>
      <button type="button" class="p-nav-button p-button cursor-interaction" data-page="资源" data-platform-page="resources" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 16 9 5 9-5"></path></svg><span>资源</span></button>
      <button type="button" class="p-nav-button p-button cursor-interaction" data-page="地图" data-platform-page="maps" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"></path><path d="M9 3v16"></path><path d="M15 5v16"></path></svg><span>地图</span></button>
      <button type="button" class="p-nav-button p-button cursor-interaction" data-page="对话" data-platform-page="dialogue" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v13H9l-5 4Z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg><span>对话</span></button><button type="button" class="p-nav-button p-button cursor-interaction" data-page="战斗" data-platform-page="battle" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 3 9 9-3 3-7-9Z"></path><path d="m20 3-9 9 3 3 7-9Z"></path><path d="m5 14 5 5"></path><path d="m19 14-5 5"></path><path d="m7 17-3 4"></path><path d="m17 17 3 4"></path></svg><span>战斗</span></button>
    </nav></aside>
    <main class="p-main">
      <div class="p-chrome"><span id="platform-connection" role="status">独立本机平台</span><button type="button" class="p-role-button p-button cursor-interaction" data-home-identity id="platform-identity">尚未选择视角</button><label class="p-display-field">显示预设<select data-display-preset aria-label="显示预设"><option value="2560x1600">2560×1600</option><option value="2560x1440">2560×1440</option><option value="2048x1536">2048×1536</option><option value="1920x1440">1920×1440</option></select></label></div>
      <header class="p-heading"><div><p class="p-eyebrow" data-eyebrow>HOME / WORKSPACE</p><h2 data-title>首页</h2></div><span class="p-page-number" data-page-number aria-hidden="true">00</span></header>
      <div class="p-workspace">
        <section class="p-page p-home" data-view="首页" data-platform-view="home" aria-label="首页"><section class="p-role-gate" data-role-gate id="platform-identity-choices" aria-label="选择进入身份"><p>D&D 2024 / 本地跑团</p><h2>以哪种身份进入？</h2><div class="p-role-options"><button type="button" class="p-role-choice p-button cursor-interaction" data-role="DM" id="enter-dm"><strong>DM</strong><span>主持人</span></button><button type="button" class="p-role-choice p-button cursor-interaction" data-role="Player" id="enter-player"><strong>Player</strong><span>玩家</span></button></div><label class="p-display-field">显示预设<select data-display-preset aria-label="入口显示预设"><option value="2560x1600">2560×1600</option><option value="2560x1440">2560×1440</option><option value="2048x1536">2048×1536</option><option value="1920x1440">1920×1440</option></select></label><p id="platform-mode-note">公共界面预览；尚未接入正式身份、模组资料和玩家权限。</p></section>
          <div class="p-home-copy"><h3>下一场冒险，<br>从这里开始。</h3><p>选一个模组，或先整理角色与素材。</p><p id="platform-current-session">未选择模组 · 正式资料尚未接入</p><span class="p-home-selection" data-home-selection>尚未选择模组</span><div class="p-home-actions"><button type="button" class="p-secondary p-button" data-change-role id="platform-switch-identity">更换 DM / Player</button><button type="button" class="p-secondary p-button" data-page="对话" id="platform-go-dialogue">查看对话演示</button><button type="button" class="p-primary p-button cursor-interaction" data-browse-modules id="platform-go-modules">选择模组</button><button type="button" class="p-secondary p-button cursor-interaction" data-page="资源">浏览资源</button></div></div>
          <div class="p-home-art" aria-hidden="true"><div class="p-home-sheet back"></div><div class="p-home-sheet front"></div></div>
        </section>
        <section class="p-page p-module" data-view="模组" data-platform-view="modules" aria-label="模组" hidden><p class="p-demo-note">公共界面演示 · 分类、封面、确认和裁切均为示例。</p>
          <div class="p-segments" role="group" aria-label="模组一级分类"><span class="p-segment-thumb" aria-hidden="true"></span><button type="button" class="p-segment cursor-interaction" data-group="a" aria-pressed="true">分类 A</button><button type="button" class="p-segment cursor-interaction" data-group="b" aria-pressed="false">分类 B</button><button type="button" class="p-segment cursor-interaction" data-group="c" aria-pressed="false">分类 C</button></div>
          <div class="p-ring" role="group" aria-label="模组封面环，可用左右方向键或滑动浏览" data-ring></div>
          <div class="p-ring-controls"><button type="button" class="p-step p-button cursor-interaction" data-module-step="-1" aria-label="上一个模组">向左</button><span class="p-ring-position" data-module-position>1 / 5</span><button type="button" class="p-step p-button cursor-interaction" data-module-step="1" aria-label="下一个模组">向右</button><button type="button" class="p-crop-open p-button cursor-interaction" data-open-crop>切割封面</button></div>
          <div class="p-module-choice"><div class="p-module-meta"><strong data-module-name>封面 A</strong><span data-module-ratio>竖版 · 2:3</span></div><button type="button" class="p-primary p-button cursor-interaction" data-confirm-module>确认示例选择</button></div><p class="p-module-confirmation" data-module-confirmation>封面与目录为占位示例，不更改正式所属模组</p>
        </section>
        <section class="p-page p-resources" data-view="资源" data-platform-view="resources" aria-label="资源" hidden><p class="p-demo-note">公共界面演示 · 卡片为占位资料，未读取真实资源。</p>
          <div class="p-resource-layout" data-resource-layout data-phase="closed">
            <div class="p-resource-track" role="group" aria-label="资源分类，横向滑动浏览" data-resource-track>
              <button type="button" class="p-resource-card p-button cursor-interaction" data-resource="角色" aria-expanded="false" aria-controls="platform-resource-drawer"><span class="p-cover-art p-person" aria-hidden="true"><span class="p-drawn-head"></span><span class="p-drawn-body"></span></span><h3>角色</h3><small>CHARACTER</small></button>
              <button type="button" class="p-resource-card p-button cursor-interaction" data-resource="NPC" aria-expanded="false" aria-controls="platform-resource-drawer"><span class="p-cover-art p-npc" aria-hidden="true"><span class="p-drawn-head"></span><span class="p-drawn-body"></span></span><h3>NPC</h3><small>NPC</small></button>
              <button type="button" class="p-resource-card p-button cursor-interaction" data-resource="怪物" aria-expanded="false" aria-controls="platform-resource-drawer"><span class="p-cover-art p-monster" aria-hidden="true"><span class="p-drawn-beast"></span><span class="p-drawn-eyes"></span></span><h3>怪物</h3><small>CREATURE</small></button>
            </div>
            <section class="p-drawer" id="platform-resource-drawer" aria-label="资源资料抽屉" hidden><header class="p-drawer-head"><strong data-drawer-title>角色</strong><button type="button" class="p-close p-button cursor-interaction" data-close-drawer>收起</button></header><div class="p-info-list" data-info-list role="group" aria-label="资源信息卡，纵向滚动浏览"></div></section>
          </div>
          <div class="p-resource-controls"><button type="button" class="p-step p-button cursor-interaction" data-resource-step="-1" aria-label="上一个资源分类">向左</button><span class="p-resource-position" data-resource-position>角色 · 1/3</span><button type="button" class="p-step p-button cursor-interaction" data-resource-step="1" aria-label="下一个资源分类">向右</button></div><p class="p-resource-selection" data-resource-selection>选择卡片，展开资料</p>
        </section>
        <section class="p-page p-map-view" data-view="地图" data-platform-view="maps" aria-label="俯视地图与区域目录" hidden><p class="p-context" data-module-context>未选择模组</p><p class="p-demo-note">公共界面演示 · 下方地图为自绘占位图。</p><div class="p-map-layout" data-map-layout><figure class="p-map-frame"><img data-map-image alt="区域A俯视占位图"><figcaption data-map-title>地图_区域A.png · 占位图</figcaption></figure><aside class="p-map-directory" aria-label="地图目录"><header class="p-map-directory-head"><strong>地图目录</strong><button type="button" class="p-map-toggle p-button cursor-interaction" data-toggle-map-tree aria-expanded="true" aria-controls="scenes-map-tree">收起</button></header><div class="p-map-tree" data-map-tree id="scenes-map-tree"><details open><summary class="cursor-interaction">地图</summary><details open><summary class="cursor-interaction">地区 A</summary><button type="button" class="p-map-leaf cursor-interaction" data-map-id="area-a" aria-pressed="true">区域 A</button><details open><summary class="cursor-interaction">建筑群</summary><button type="button" class="p-map-leaf cursor-interaction" data-map-id="area-a1" aria-pressed="false">区域 A1</button><button type="button" class="p-map-leaf cursor-interaction" data-map-id="area-a2" aria-pressed="false">区域 A2</button></details></details><details open><summary class="cursor-interaction">地区 B</summary><button type="button" class="p-map-leaf cursor-interaction" data-map-id="area-b" aria-pressed="false">区域 B</button></details></details></div></aside></div></section>
        <section class="p-page p-dialogue-view" data-view="对话" data-platform-view="dialogue" aria-label="对话窗口" hidden><p class="p-context" data-module-context>未选择模组</p><section class="platform-demo-boundary p-demo-note"><strong>公共界面演示</strong><p>以下群聊、资源与地图均为公共示例，不属于任何已选模组，不代表已发放资料或正式进度。</p></section><div data-dialogue-host></div></section><section class="p-page p-preview-page" data-view="战斗" data-platform-view="battle" aria-label="战斗布局示意" hidden><p class="p-context" data-module-context>未选择模组</p><div data-battle-host></div><h3>战斗工作区</h3><p>棋盘与操作区域 · 布局示意</p><button type="button" class="p-secondary p-button cursor-interaction" data-page="首页">返回首页</button></section>
      </div>
      <footer class="p-footer"><label class="p-preset">预设配色<select data-preset aria-label="预设配色"><option value="sunlit">晴光雾蓝</option><option value="mint">薄荷折光</option><option value="violet" selected>冰青紫影</option><option value="peach">桃霞青影</option><option value="custom" disabled>自定义</option></select></label>
        <details class="p-settings"><summary class="cursor-interaction">外观设置</summary><div class="p-settings-grid">
          <p class="p-profile-note" data-profile-label>2560×1600 的独立外观</p>
          <label class="p-color-field"><input type="color" data-color="ground" value="#f5f6fa" aria-label="背景基础色"><span>背景</span><code data-code="ground">#F5F6FA</code></label>
          <label class="p-color-field"><input type="color" data-color="light" value="#d9f6ff" aria-label="受光基础色"><span>受光</span><code data-code="light">#D9F6FF</code></label>
          <label class="p-color-field"><input type="color" data-color="shadow" value="#9a9cc5" aria-label="阴影基础色"><span>阴影</span><code data-code="shadow">#9A9CC5</code></label>
          <label class="p-color-field"><input type="color" data-color="accent" value="#e9b5d5" aria-label="点睛基础色"><span>点睛</span><code data-code="accent">#E9B5D5</code></label>
          <label class="p-depth-field"><span>地面占比<output data-floor-value>15%</output></span><input type="range" min="0" max="20" step="1" value="15" data-floor-percent aria-valuetext="15%"></label>
          <label class="p-depth-field"><span>浮起幅度<output data-appearance-output="lift">7px</output></span><input type="range" min="2" max="13" step="1" value="7" data-appearance-value="lift" aria-label="浮起幅度"></label><label class="p-depth-field"><span>大块光影浓度<output data-appearance-output="strength">85%</output></span><input type="range" min="60" max="100" step="1" value="85" data-appearance-value="strength" aria-label="大块光影浓度"></label><p class="p-gradient-label">信息卡渐变</p>
          <label class="p-color-field"><input type="color" data-gradient="start" value="#ffffff" aria-label="信息卡渐变起点"><span>起点</span><code data-gradient-code="start">#FFFFFF</code></label>
          <label class="p-color-field"><input type="color" data-gradient="end" value="#e9b5d5" aria-label="信息卡渐变终点"><span>终点</span><code data-gradient-code="end">#E9B5D5</code></label>
        </div></details>
      </footer><div class="p-appearance-status"><span data-appearance-status role="status">正在读取本地外观设置</span><button type="button" class="p-secondary p-button" data-appearance-retry hidden>重新读取已保存外观</button></div>
    </main>
    <dialog class="p-crop-dialog" data-crop-dialog aria-labelledby="cover-crop-title"><header class="p-crop-header"><div><h3 id="cover-crop-title">切割封面</h3><p class="p-crop-subtitle" data-crop-subtitle>仅改变封面显示，保留完整原图</p></div><button type="button" class="p-close p-button cursor-interaction" data-crop-cancel>取消</button></header><div class="p-crop-body"><div class="p-crop-source" data-crop-stage><img data-crop-original alt="待裁切的原始封面"><div class="p-crop-outline" data-crop-outline></div></div><div class="p-crop-controls"><label>显示方式<select data-crop-mode><option value="contain">完整显示</option><option value="crop">裁切填满</option></select></label><label><span>水平位置<output data-crop-output="x">50%</output></span><input type="range" min="0" max="100" step="1" value="50" data-crop-value="x" aria-label="裁切水平位置"></label><label><span>垂直位置<output data-crop-output="y">50%</output></span><input type="range" min="0" max="100" step="1" value="50" data-crop-value="y" aria-label="裁切垂直位置"></label><label><span>放大<output data-crop-output="zoom">1×</output></span><input type="range" min="1" max="3" step="0.01" value="1" data-crop-value="zoom" aria-label="裁切放大"></label><canvas class="p-crop-preview" width="300" height="400" data-crop-preview aria-label="封面裁切预览"></canvas></div></div><footer class="p-crop-footer"><details class="p-crop-json"><summary class="cursor-interaction">统一配置 · cover-crops.json</summary><pre data-crop-json></pre></details><div class="p-crop-actions"><button type="button" class="p-secondary p-button cursor-interaction" data-crop-full>完整原图</button><button type="button" class="p-primary p-button cursor-interaction" data-crop-apply>应用裁切</button></div></footer></dialog>
  </div><span class="p-sr" data-announcement aria-live="polite"></span>
</div>`;
const pageKeys = {"首页":"home","模组":"modules","资源":"resources","地图":"maps","对话":"dialogue","战斗":"battle"};
export function createDesignWorkspace({ onPageChange = () => {}, onIdentityChange = () => {}, onAppearanceChange = () => {}, onAppearanceRetry = () => {} } = {}) {
  const wrapper=document.createElement("div");wrapper.id="platform-root";wrapper.innerHTML=markup;document.body.prepend(wrapper);
  const root=wrapper.querySelector('#platform-covers'),app=root.querySelector('[data-app]');
  const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n)),mod=(n,m)=>(n%m+m)%m;
  const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const presets={sunlit:{ground:'#F6F7F2',light:'#FAEECB',shadow:'#7C90A0',accent:'#B8E3DC'},mint:{ground:'#F2F8F5',light:'#E6FFC2',shadow:'#91ACBE',accent:'#8FDCCB'},violet:{ground:'#F5F6FA',light:'#D9F6FF',shadow:'#9A9CC5',accent:'#E9B5D5'},peach:{ground:'#FFF5F1',light:'#FFD9B4',shadow:'#8FAFC0',accent:'#ECA8B8'}};
  const displayPresets={'2560x1600':{width:2560,height:1600},'2560x1440':{width:2560,height:1440},'2048x1536':{width:2048,height:1536},'1920x1440':{width:1920,height:1440}};
  const defaultAppearance=()=>({...presets.violet,preset:'violet',lift:7,strength:85,floorPercent:15,gradient:{start:'#FFFFFF',end:'#E9B5D5'}});
  const appearanceProfiles=Object.fromEntries(Object.keys(displayPresets).map(key=>[key,defaultAppearance()]));
  let displayPreset='2560x1600';
  const theme={...presets.violet,preset:'violet',lift:7,strength:85,floorPercent:15},gradient={start:'#FFFFFF',end:'#E9B5D5'};
  const groups={a:{name:'分类 A',items:[{id:'a1',name:'封面 A',w:300,h:450},{id:'a2',name:'封面 B',w:420,h:560},{id:'a3',name:'封面 C',w:420,h:420},{id:'a4',name:'封面 D',w:640,h:360},{id:'a5',name:'封面 E',w:270,h:540}]},b:{name:'分类 B',items:[{id:'b1',name:'封面 F',w:640,h:360},{id:'b2',name:'封面 G',w:420,h:420},{id:'b3',name:'封面 H',w:300,h:450}]},c:{name:'分类 C',items:[{id:'c1',name:'封面 I',w:420,h:560}]}};
  Object.entries(groups).forEach(([key,group])=>group.items.forEach(item=>{item.directory=group.name+'/'+item.name.replace('封面','模组');item.coverFile='模组封面.png';}));
  const coverConfig={schemaVersion:1,frameAspectRatio:[3,4],covers:{}};
  let cropDraft=null,cropSource=null,coverRenderSequence=0;
  const maps={'area-a':{name:'区域A',file:'地图_区域A.png',seed:0},'area-a1':{name:'区域A1',file:'地图_区域A1.png',seed:1},'area-a2':{name:'区域A2',file:'地图_区域A2.png',seed:2},'area-b':{name:'区域B',file:'地图_区域B.png',seed:3}};
  const pages=['首页','模组','资源','地图','对话','战斗'],categories=['角色','NPC','怪物'];
  const state={role:null,page:'首页',group:'a',moduleIndex:0,confirmed:null,resourceIndex:0,drawerOpen:false,infoSelection:null,mapId:'area-a',mapCollapsed:false};
  const items=()=>groups[state.group].items,announce=text=>{$('[data-announcement]').textContent=text;};
  const findModule=id=>Object.entries(groups).flatMap(([group,data])=>data.items.map((item,index)=>({group,item,index}))).find(entry=>entry.item.id===id);
  const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
  const mix=(a,b,t)=>'#'+rgb(a).map((x,i)=>Math.round(x*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
  const lum=hex=>rgb(hex).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const readable=(surface,seed,target=4.5)=>{const anchor=lum(surface)>.179?'#000000':'#FFFFFF';for(let t=0;t<=1.001;t+=.025){const ink=mix(seed,anchor,Math.min(1,t));if(contrast(ink,surface)>=target)return ink;}return anchor;};
  const ratioLabel=item=>{const gcd=(a,b)=>b?gcd(b,a%b):a,d=gcd(item.w,item.h);return `${item.w/d}:${item.h/d}`;};
  let ringAngle=0,ringTarget=0,ringFrame=0,ringTime=0,ringGeometry=[],shadowNodes=[],ringPointer=null,suppressRingClick=0,wheelTime=0;
  let resourceVersion=0,resourceAnimation=null,resourceFlight=null,resourcePhase='closed',resourcePointer=null,suppressResourceClick=0,scrollTimer=0,resizeFrame=0,lastWidth=0;
  const setResourcePhase=phase=>{resourcePhase=phase;$('[data-resource-layout]').dataset.phase=phase;};
  function storeAppearance(){appearanceProfiles[displayPreset]={...theme,gradient:{...gradient}};}
  function validatedAppearance(raw,base=defaultAppearance()){
    const result={...base,gradient:{...base.gradient}};if(!raw||typeof raw!=='object')return result;
    for(const key of ['ground','light','shadow','accent'])if(/^#[\da-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];
    if(Object.hasOwn(presets,raw.preset)||raw.preset==='custom')result.preset=raw.preset;
    for(const [key,min,max] of [['floorPercent',0,20],['lift',2,13],['strength',60,100]])if(Number.isFinite(raw[key]))result[key]=clamp(raw[key],min,max);
    result.floorPercent=Math.round(result.floorPercent);
    for(const key of ['start','end'])if(/^#[\da-f]{6}$/i.test(raw.gradient?.[key]||''))result.gradient[key]=raw.gradient[key];
    return result;
  }
  function loadAppearance(){const profile=appearanceProfiles[displayPreset];for(const key of Object.keys(theme))theme[key]=profile[key];Object.assign(gradient,profile.gradient);}
  function layoutFrame(){
    const width=app.clientWidth,compact=width<760,preset=displayPresets[displayPreset];
    app.classList.toggle('is-compact',compact);root.style.setProperty('--frame-height',(width*preset.height/preset.width)+'px');
    const workspace=$('.p-workspace').clientHeight||440;root.style.setProperty('--resource-card-height',clamp(workspace-114,200,292)+'px');
    all('[data-display-preset]').forEach(select=>{select.value=displayPreset;});
    $('[data-profile-label]').textContent=displayPreset.replace('x','×')+' 的独立外观';
    renderSegment();drawRing();renderObjectShadows();lastWidth=width;
  }
  function switchDisplay(id){if(!Object.hasOwn(displayPresets,id)||id===displayPreset)return;storeAppearance();cancelResource(state.drawerOpen);stopRing(true);displayPreset=id;loadAppearance();renderTheme();layoutFrame();renderPage();if(state.page==='资源')scrollResource(state.resourceIndex,false);save();}
  function makeCover(item,index){
    const canvas=document.createElement('canvas');canvas.width=item.w;canvas.height=item.h;const c=canvas.getContext('2d'),w=item.w,h=item.h;
    c.fillStyle=mix(theme.ground,theme.shadow,.08);c.fillRect(0,0,w,h);c.fillStyle=mix(theme.light,'#FFFFFF',.1);c.beginPath();c.moveTo(w*.58,0);c.lineTo(w,0);c.lineTo(w*.55,h);c.lineTo(0,h);c.closePath();c.fill();c.fillStyle=mix(theme.shadow,theme.ground,.28);c.beginPath();c.moveTo(w*.72,h*.28);c.lineTo(w,h*.48);c.lineTo(w,h);c.lineTo(w*.34,h);c.closePath();c.fill();c.fillStyle=mix(theme.accent,theme.ground,.26);c.beginPath();c.arc(w*.4,h*.39,Math.min(w,h)*.22,0,Math.PI*2);c.fill();c.fillStyle=readable(theme.light,theme.shadow,6);c.font=`400 ${Math.round(Math.min(w,h)*.13)}px Georgia`;c.fillText(String.fromCharCode(65+index),w*.12,h*.19);return canvas.toDataURL('image/png');
  }
  function cropRect(item,draft){
    const width=Math.min(item.w,item.h*3/4)/draft.zoom,height=width*4/3;
    return {x:(item.w-width)*draft.x/100/item.w,y:(item.h-height)*draft.y/100/item.h,width:width/item.w,height:height/item.h};
  }
  function cropEntry(item,draft){return {file:item.coverFile,sourceSize:{width:item.w,height:item.h},mode:draft.mode,...(draft.mode==='crop'?{crop:cropRect(item,draft)}:{})};}
  function validCrop(item,rect){return rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=1.000001&&Math.abs(rect.width*item.w/(rect.height*item.h)-.75)<.005;}
  function applyCoverImage(image,item,index){
    const source=makeCover(item,index),entry=coverConfig.covers[item.directory],token=String(++coverRenderSequence);image.dataset.renderToken=token;image.dataset.sourceWidth=item.w;image.dataset.sourceHeight=item.h;image.dataset.coverFile=item.coverFile;
    const cropped=entry?.mode==='crop'&&entry.sourceSize?.width===item.w&&entry.sourceSize?.height===item.h&&validCrop(item,entry.crop);image.dataset.cropMode=cropped?'crop':'contain';
    if(!cropped){image.src=source;return;}
    const original=new Image();original.onload=()=>{if(!image.isConnected||image.dataset.renderToken!==token)return;const canvas=document.createElement('canvas');canvas.width=300;canvas.height=400;const c=canvas.getContext('2d'),r=entry.crop;c.drawImage(original,r.x*item.w,r.y*item.h,r.width*item.w,r.height*item.h,0,0,300,400);image.src=canvas.toDataURL('image/png');};original.src=source;
  }
  function refreshCoverImages(){all('.p-cover img').forEach((image,index)=>applyCoverImage(image,items()[index],index));}
  function layoutCrop(beforeOpen=false){
    const dialog=$('[data-crop-dialog]');if(!dialog.open&&!beforeOpen)return;const box=app.getBoundingClientRect(),view=app.ownerDocument.defaultView,inset=box.width<430?8:20;dialog.style.left=(box.left+view.scrollX+inset)+'px';dialog.style.top=(box.top+view.scrollY+inset)+'px';dialog.style.width=(box.width-inset*2)+'px';dialog.style.height=(box.height-inset*2)+'px';renderCropPreview();
  }
  function renderCropPreview(){
    if(!cropDraft||!cropSource?.complete||!cropSource.naturalWidth)return;const found=findModule(cropDraft.id);if(!found)return;const item=found.item,rect=cropRect(item,cropDraft),canvas=$('[data-crop-preview]'),c=canvas.getContext('2d');c.clearRect(0,0,300,400);c.fillStyle=getComputedStyle(root).getPropertyValue('--paper').trim();c.fillRect(0,0,300,400);
    if(cropDraft.mode==='crop')c.drawImage(cropSource,rect.x*item.w,rect.y*item.h,rect.width*item.w,rect.height*item.h,0,0,300,400);
    else{const scale=Math.min(300/item.w,400/item.h),w=item.w*scale,h=item.h*scale;c.drawImage(cropSource,(300-w)/2,(400-h)/2,w,h);}
    const stage=$('[data-crop-stage]'),scale=Math.min(stage.clientWidth/item.w,stage.clientHeight/item.h),w=item.w*scale,h=item.h*scale,outline=$('[data-crop-outline]');outline.hidden=cropDraft.mode!=='crop';outline.style.left=((stage.clientWidth-w)/2+rect.x*w)+'px';outline.style.top=((stage.clientHeight-h)/2+rect.y*h)+'px';outline.style.width=rect.width*w+'px';outline.style.height=rect.height*h+'px';
    $('[data-crop-mode]').value=cropDraft.mode;all('[data-crop-value]').forEach(input=>{const key=input.dataset.cropValue;input.value=cropDraft[key];input.disabled=cropDraft.mode!=='crop'||key==='x'&&rect.width>=.999999||key==='y'&&rect.height>=.999999;});all('[data-crop-output]').forEach(output=>{const key=output.dataset.cropOutput;output.value=key==='zoom'?cropDraft.zoom.toFixed(2)+'×':cropDraft[key]+'%';});
    const preview={schemaVersion:1,frameAspectRatio:[3,4],covers:{...coverConfig.covers,[item.directory]:cropEntry(item,cropDraft)}};$('[data-crop-json]').textContent=JSON.stringify(preview,null,2);
  }
  function openCrop(){
    if(!state.role||state.page!=='模组')return;stopRing(true);drawRing();updateModuleUI();const item=items()[state.moduleIndex],entry=coverConfig.covers[item.directory];cropDraft={id:item.id,mode:entry?.mode||'crop',x:50,y:50,zoom:1};
    if(entry?.mode==='crop'&&validCrop(item,entry.crop)){const rect=entry.crop,maxWidth=Math.min(item.w,item.h*3/4);cropDraft.zoom=Number(clamp(maxWidth/(rect.width*item.w),1,3).toFixed(2));cropDraft.x=rect.width<.999999?Math.round(clamp(rect.x/(1-rect.width)*100,0,100)):50;cropDraft.y=rect.height<.999999?Math.round(clamp(rect.y/(1-rect.height)*100,0,100)):50;}
    $('[data-crop-subtitle]').textContent=item.name+' · '+ratioLabel(item)+' · 裁切只改变封面显示';$('.p-crop-json').open=false;$('[data-crop-mode]').value=cropDraft.mode;const dialog=$('[data-crop-dialog]');layoutCrop(true);dialog.showModal();layoutCrop();cropSource=new Image();const draft=cropDraft;cropSource.onload=()=>{if(cropDraft===draft)renderCropPreview();};cropSource.src=makeCover(item,findModule(item.id).index);$('[data-crop-original]').src=cropSource.src;$('[data-crop-original]').alt=item.name+'完整原图';
  }
  function closeCrop(){const dialog=$('[data-crop-dialog]');if(dialog.open)dialog.close();cropDraft=null;cropSource=null;}
  function applyCrop(){if(!cropDraft)return;const item=findModule(cropDraft.id)?.item;if(!item)return;coverConfig.covers[item.directory]=cropEntry(item,cropDraft);refreshCoverImages();closeCrop();announce('已更新'+item.name+'封面显示');save();}
  function restoreCoverConfig(raw){
    if(raw?.schemaVersion!==1||!raw.covers||typeof raw.covers!=='object')return;const next={};Object.values(groups).flatMap(group=>group.items).forEach(item=>{const entry=raw.covers[item.directory];if(!entry||entry.file!==item.coverFile||entry.sourceSize?.width!==item.w||entry.sourceSize?.height!==item.h)return;if(entry.mode==='contain')next[item.directory]={file:item.coverFile,sourceSize:{width:item.w,height:item.h},mode:'contain'};else if(entry.mode==='crop'&&validCrop(item,entry.crop))next[item.directory]={file:item.coverFile,sourceSize:{width:item.w,height:item.h},mode:'crop',crop:Object.fromEntries(['x','y','width','height'].map(key=>[key,entry.crop[key]]))};});coverConfig.covers=next;
  }
  function buildCovers(){
    stopRing(false);const ring=$('[data-ring]');ring.replaceChildren();
    items().forEach((item,index)=>{const button=document.createElement('button');button.type='button';button.className='p-cover cursor-interaction';button.dataset.moduleIndex=index;button.setAttribute('aria-label',`${item.name}，${ratioLabel(item)}`);button.setAttribute('aria-pressed','false');const box=document.createElement('span');box.className='p-cover-image';const image=document.createElement('img');image.src=makeCover(item,index);image.alt=`${item.name}，${ratioLabel(item)}占位图`;image.draggable=false;image.width=item.w;image.height=item.h;box.append(image);const caption=document.createElement('span');caption.className='p-cover-caption';const name=document.createElement('span'),ratio=document.createElement('span');name.textContent=item.name;ratio.textContent=ratioLabel(item);caption.append(name,ratio);button.append(box,caption);ring.append(button);});
    refreshCoverImages();const shadows=$('.p-object-shadows');shadows.replaceChildren();shadowNodes=items().map(()=>{const node=document.createElement('span');node.className='p-object-shadow';shadows.append(node);return node;});ringAngle=ringTarget=-state.moduleIndex*2*Math.PI/items().length;drawRing();updateModuleUI();
  }
  function renderSegment(){const button=$(`[data-group="${state.group}"]`),thumb=$('.p-segment-thumb');all('[data-group]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));if(button.offsetWidth){thumb.style.width=button.offsetWidth+'px';thumb.style.transform=`translateX(${button.offsetLeft}px)`;}}
  function updateModuleUI(){
    const current=items()[state.moduleIndex],moving=Math.abs(ringTarget-ringAngle)>.003;
    $('[data-module-name]').textContent=current.name;$('[data-module-ratio]').textContent=`${current.w>current.h?'横版':current.w===current.h?'方形':'竖版'} · ${ratioLabel(current)}`;$('[data-module-position]').textContent=`${state.moduleIndex+1} / ${items().length}`;
    $('[data-confirm-module]').textContent=state.confirmed===current.id?'已确认':'确认选择';$('[data-confirm-module]').disabled=moving||state.confirmed===current.id;
    all('[data-module-step]').forEach(button=>{button.disabled=items().length===1;});
    const chosen=findModule(state.confirmed);$('[data-module-confirmation]').textContent=chosen?`已选择：${groups[chosen.group].name} / ${chosen.item.name}`:'封面与目录为占位示例';$('[data-ring]').dataset.motion=moving?'rotating':'idle';
  }
  function drawRing(){
    if(!state.role||state.page!=='模组')return;const ring=$('[data-ring]'),width=ring.clientWidth,height=ring.clientHeight;if(!width||!height)return;
    const coverWidth=clamp(Math.min(width*.23,(height*.76-27)/1.333),72,154),radius=items().length===1?0:Math.max(20,(width-coverWidth-32)/2),depth=Math.min(30,height*.10);
    ringGeometry=items().map((item,index)=>{const angle=ringAngle+index*2*Math.PI/items().length,z=Math.cos(angle),front=(z+1)/2,x=Math.sin(angle)*radius,y=z*depth-x*.07,scale=.65+.35*front,button=ring.children[index];button.style.width=coverWidth+'px';button.style.opacity=String(.43+.57*front);button.style.zIndex=String(Math.round(front*100)+1);button.style.transform=`translate(-50%,-50%) translate3d(${x}px,${y}px,0) rotateY(${-Math.sin(angle)*25}deg) rotateZ(${-Math.sin(angle)*4}deg) scale(${scale})`;button.setAttribute('aria-pressed',String(index===state.moduleIndex));return {x,front,scale,width:coverWidth};});ring.dataset.angle=String(ringAngle);renderObjectShadows();
  }
  function stopRing(snap){if(ringFrame)cancelAnimationFrame(ringFrame);ringFrame=0;ringTime=0;if(snap)ringAngle=ringTarget;}
  function animateRing(){
    if(reduced()||!state.role||state.page!=='模组'){stopRing(true);drawRing();updateModuleUI();return;}
    if(ringFrame)return;ringTime=0;
    const tick=time=>{ringFrame=0;if(!state.role||state.page!=='模组'){stopRing(true);return;}const delta=ringTime?Math.min(40,time-ringTime):16;ringTime=time;ringAngle+=(ringTarget-ringAngle)*(1-Math.exp(-delta/105));if(Math.abs(ringTarget-ringAngle)<.003)ringAngle=ringTarget;drawRing();updateModuleUI();if(ringAngle!==ringTarget)ringFrame=requestAnimationFrame(tick);else ringTime=0;};
    ringFrame=requestAnimationFrame(tick);
  }
  function stepModule(delta,focus=false){if(items().length<2)return;state.moduleIndex=mod(state.moduleIndex+delta,items().length);ringTarget-=delta*2*Math.PI/items().length;updateModuleUI();animateRing();if(focus)$(`[data-module-index="${state.moduleIndex}"]`).focus({preventScroll:true});announce(items()[state.moduleIndex].name);save();}
  function chooseModule(index,focus=false){index=clamp(index,0,items().length-1);let delta=mod(index-state.moduleIndex,items().length);if(delta>items().length/2)delta-=items().length;state.moduleIndex=index;ringTarget-=delta*2*Math.PI/items().length;updateModuleUI();animateRing();if(focus)$(`[data-module-index="${index}"]`).focus({preventScroll:true});save();}
  function renderObjectShadows(){
    const visible=!!state.role&&state.page==='模组'&&theme.floorPercent>0;$('.p-object-shadows').hidden=!visible;$('.p-floor-contact').hidden=state.page==='模组';if(!visible)return;
    const scene=app.getBoundingClientRect(),ring=$('[data-ring]').getBoundingClientRect(),t=theme.floorPercent/20,projection=.35/(1-theme.floorPercent/100-.65);
    ringGeometry.forEach((g,index)=>{const node=shadowNodes[index];if(!node)return;const x=(ring.left-scene.left+ring.width/2+g.x)/scene.width*100;node.style.left=(63+(x-63)*(1+(projection-1)*.25))+'%';node.style.top=(28+g.front*34)+'%';node.style.width=g.width*g.scale*(.62+.38*t)+'px';node.style.height=(9+14*t)*g.scale+'px';node.style.opacity=String((.07+.19*g.front)*Math.min(1,theme.floorPercent/5));node.style.filter=`blur(${6+5*(1-g.front)}px)`;});
  }
  function renderFloor(){
    theme.floorPercent=Math.round(clamp(theme.floorPercent,0,20));const depth=theme.floorPercent/100,horizon=1-depth,t=depth/.2,projection=.35/(horizon-.65),near=x=>63+(x-63)*projection,polygon=(left,right)=>`polygon(${left}% 0,${right}% 0,${near(right)}% 100%,${near(left)}% 100%)`;
    root.style.setProperty('--floor-depth',theme.floorPercent+'%');root.style.setProperty('--floor-top',(100-theme.floorPercent)+'%');root.style.setProperty('--floor-light-clip',polygon(68-35*horizon,92-40*horizon));root.style.setProperty('--floor-shadow-clip',polygon(71,85));const width=44+22*t;root.style.setProperty('--contact-width',width+'%');root.style.setProperty('--contact-left',(55-width/2)+'%');root.style.setProperty('--contact-blur',(4+10*t)+'px');root.style.setProperty('--contact-opacity',String(.25*Math.min(1,theme.floorPercent/5)));$('.p-ground').hidden=depth===0;$('[data-floor-percent]').value=theme.floorPercent;$('[data-floor-percent]').setAttribute('aria-valuetext',theme.floorPercent+'%');$('[data-floor-value]').value=theme.floorPercent+'%';renderObjectShadows();
  }
  function renderGradient(){root.style.setProperty('--gradient-start',gradient.start);root.style.setProperty('--gradient-end',gradient.end);root.style.setProperty('--info-ink',readable(gradient.start,theme.shadow,7));all('[data-gradient]').forEach(input=>{input.value=gradient[input.dataset.gradient];});all('[data-gradient-code]').forEach(code=>{code.textContent=gradient[code.dataset.gradientCode].toUpperCase();});}
  function renderTheme(){
    const paper=mix(theme.ground,'#FFFFFF',.13),hover=mix(paper,theme.light,.58),active=mix(hover,theme.accent,.12),rail=mix(theme.ground,theme.shadow,.8);for(const key of ['ground','light','shadow','accent'])root.style.setProperty('--'+key,theme[key]);
    const values={paper,ink:readable(paper,theme.shadow,6),quiet:readable(paper,theme.shadow,4.5),'light-ink':readable(theme.light,theme.shadow,6),'hover-surface':hover,'hover-ink':readable(hover,theme.shadow,6),'active-surface':active,'active-ink':readable(active,theme.shadow,6),rail,'rail-ink':readable(rail,theme.shadow,5),cast:`rgba(${rgb(mix(theme.shadow,'#000000',.38)).join(',')},.28)`,lift:theme.lift+'px','light-strength':theme.strength/100,'plane-opacity':theme.strength*.0072};Object.entries(values).forEach(([key,value])=>root.style.setProperty('--'+key,value));all('[data-color]').forEach(input=>{input.value=theme[input.dataset.color];});all('[data-code]').forEach(code=>{code.textContent=theme[code.dataset.code].toUpperCase();});$('[data-preset]').value=theme.preset;for(const key of ['lift','strength']){$('[data-appearance-value="'+key+'"]').value=theme[key];$('[data-appearance-output="'+key+'"]').value=theme[key]+(key==='lift'?'px':'%');}for(const [key,value] of Object.entries({ground:theme.ground,light:theme.light,shadow:theme.shadow,ink:values.ink,quiet:values.quiet,paper,cast:values.cast,lift:theme.lift+'px'})){wrapper.style.setProperty('--platform-'+key,value);}renderGradient();renderFloor();refreshCoverImages();renderMap();
  }
  function renderHome(){const selected=findModule(state.confirmed);$('[data-home-selection]').textContent=selected?`示例已选择：${groups[selected.group].name} / ${selected.item.name}（正式模组未选择）`:'尚未选择示例模组';$('[data-browse-modules]').textContent=selected?'查看已选示例':'选择模组示例';}
  function renderIdentity(){
    const entered=!!state.role;$('[data-role-gate]').hidden=entered;$('.p-side').hidden=false;$('.p-main').hidden=false;
    $('.p-home-copy').hidden=!entered;$('.p-home-art').hidden=!entered;
    $('[data-home-identity]').textContent=state.role?state.role+' · 界面预览':'尚未选择视角';
    all('[data-platform-page]').forEach(button=>{button.disabled=button.dataset.page!=='首页'&&!entered;});
    wrapper.dataset.role=state.role?state.role.toLowerCase():'';layoutFrame();
  }
  function renderPage(){wrapper.dataset.page=pageKeys[state.page];onPageChange(pageKeys[state.page]);all('[data-view]').forEach(view=>{view.hidden=view.dataset.view!==state.page;});all('.p-nav [data-page]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.page===state.page)));$('[data-title]').textContent=state.page;$('[data-eyebrow]').textContent=['HOME','MODULE','RESOURCES','MAP','DIALOGUE','BATTLE'][pages.indexOf(state.page)]+' / WORKSPACE';$('[data-page-number]').textContent=String(pages.indexOf(state.page)).padStart(2,'0');renderHome();renderSegment();layoutFrame();drawRing();updateModuleUI();renderObjectShadows();if(state.page==='资源'&&resourcePhase==='closed')scrollResource(state.resourceIndex,false);}
  function goPage(page){page=pages.find(name=>pageKeys[name]===page)||page;if((!state.role&&page!=='首页')||!pages.includes(page))return false;if(state.page!==page){cancelResource(false);stopRing(true);$('.p-settings').open=false;}state.page=page;renderPage();announce(page);$('[data-title]').focus({preventScroll:true});save();return true;}
  function renderInfo(){const category=categories[state.resourceIndex];$('[data-drawer-title]').textContent=category;const list=$('[data-info-list]');list.replaceChildren();for(let i=1;i<=6;i++){const button=document.createElement('button');button.type='button';button.className='p-info-card p-button cursor-interaction';button.dataset.info=category+i;button.setAttribute('aria-pressed',String(state.infoSelection===button.dataset.info));const text=document.createElement('span');text.className='p-info-text';const name=document.createElement('span'),note=document.createElement('small');name.textContent=category+' '+String(i).padStart(2,'0');note.textContent='资料示例';text.append(name,note);button.append(text);list.append(button);}list.scrollTop=0;$('[data-resource-selection]').textContent=state.infoSelection?'已选：'+state.infoSelection:'选择卡片，展开资料';}
  function updateResourceCards(){all('[data-resource]').forEach((button,index)=>button.setAttribute('aria-expanded',String(state.drawerOpen&&index===state.resourceIndex)));$('[data-resource-position]').textContent=`${categories[state.resourceIndex]} · ${state.resourceIndex+1}/3`;}
  function scrollResource(index,smooth=true){const track=$('[data-resource-track]'),button=track.children[index];if(!button)return;const left=button.offsetLeft-track.offsetLeft-parseFloat(getComputedStyle(track).paddingLeft);track.scrollTo({left,behavior:smooth&&!reduced()?'smooth':'instant'});}
  function cancelResource(keepOpen=false){
    resourceVersion++;resourceAnimation?.cancel();resourceAnimation=null;resourceFlight?.remove();resourceFlight=null;clearTimeout(scrollTimer);resourcePointer=null;const layout=$('[data-resource-layout]');layout.classList.remove('is-moving');$('[data-resource-track]').classList.remove('is-dragging');state.drawerOpen=!!keepOpen;layout.classList.toggle('is-open',state.drawerOpen);$('.p-drawer').hidden=!state.drawerOpen;$('.p-drawer').classList.toggle('is-visible',state.drawerOpen);setResourcePhase(state.drawerOpen?'open':'closed');updateResourceCards();
  }
  async function openDrawer(index,focusAfter=false){
    cancelResource(false);const version=resourceVersion;state.resourceIndex=index;state.infoSelection=null;updateResourceCards();
    const layout=$('[data-resource-layout]'),button=$(`[data-resource="${categories[index]}"]`),origin=button.getBoundingClientRect(),scene=layout.getBoundingClientRect();
    const flight=button.cloneNode(true);flight.removeAttribute('data-resource');flight.removeAttribute('aria-controls');flight.removeAttribute('aria-expanded');flight.setAttribute('aria-hidden','true');flight.inert=true;flight.classList.add('p-resource-flight');flight.style.transform='none';flight.style.left=(origin.left-scene.left)+'px';flight.style.top=(origin.top-scene.top)+'px';flight.style.width=origin.width+'px';flight.style.height=origin.height+'px';layout.append(flight);resourceFlight=flight;
    layout.classList.add('is-moving','is-open');setResourcePhase('moving');scrollResource(index,false);const destination=button.getBoundingClientRect(),end={left:(destination.left-scene.left)+'px',top:(destination.top-scene.top)+'px',width:destination.width+'px',height:destination.height+'px'};
    if(!reduced()){
      const animation=flight.animate([{left:flight.style.left,top:flight.style.top,width:flight.style.width,height:flight.style.height},end],{duration:520,easing:'cubic-bezier(.22,.72,.2,1)',fill:'forwards'});resourceAnimation=animation;
      try{await animation.finished;}catch{return;}
    }
    if(version!==resourceVersion||!state.role||state.page!=='资源')return;
    resourceAnimation=null;flight.remove();resourceFlight=null;layout.classList.remove('is-moving');state.drawerOpen=true;renderInfo();updateResourceCards();const drawer=$('.p-drawer');drawer.hidden=false;drawer.classList.remove('is-visible');setResourcePhase('opening');drawer.getBoundingClientRect();
    if(reduced())drawer.classList.add('is-visible');else{await new Promise(resolve=>requestAnimationFrame(resolve));if(version!==resourceVersion)return;drawer.classList.add('is-visible');await new Promise(resolve=>setTimeout(resolve,310));}
    if(version!==resourceVersion)return;setResourcePhase('open');if(focusAfter)button.focus({preventScroll:true});announce(categories[index]+'资料');save();
  }
  function closeDrawer(){cancelResource(false);announce('已收起资料');save();}
  function stepResource(delta,focus=false){const index=mod(state.resourceIndex+delta,categories.length);if(resourcePhase!=='closed'){openDrawer(index,focus);return;}state.resourceIndex=index;state.infoSelection=null;updateResourceCards();scrollResource(index);if(focus)$(`[data-resource="${categories[index]}"]`).focus({preventScroll:true});save();}
  function renderMap(){
    const map=maps[state.mapId],canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const c=canvas.getContext('2d'),paper=mix(theme.ground,theme.light,.12),ink=readable(paper,theme.shadow,6);c.fillStyle=paper;c.fillRect(0,0,1200,800);
    c.fillStyle=mix(theme.shadow,theme.ground,.75);c.fillRect(0,0,1200,800);c.fillStyle=mix(theme.light,theme.ground,.6);c.fillRect(58,58,1084,684);c.strokeStyle=mix(theme.shadow,theme.ground,.25);c.lineWidth=9;
    const variants=[[[120,120,290,210],[470,120,230,210],[760,120,300,210],[120,420,250,240],[430,420,310,240],[800,420,260,240]],[[100,100,400,250],[590,100,490,250],[100,450,260,230],[450,450,270,230],[810,450,270,230]],[[120,110,220,250],[430,110,300,250],[820,110,250,250],[120,460,420,220],[630,460,440,220]],[[100,100,260,260],[460,100,300,260],[860,100,230,260],[100,460,420,220],[620,460,470,220]]];
    variants[map.seed].forEach((rect,index)=>{c.fillStyle=mix(theme.ground,index%2?theme.accent:theme.shadow,.13);c.fillRect(...rect);c.strokeRect(...rect);c.fillStyle=ink;c.font='400 24px Microsoft YaHei';c.fillText(String(index+1).padStart(2,'0'),rect[0]+22,rect[1]+40);});c.fillStyle=mix(theme.shadow,theme.ground,.5);c.fillRect(130,370,930,28);c.fillStyle=ink;c.font='400 25px Microsoft YaHei';c.fillText(map.name,62,42);
    const image=$('[data-map-image]');image.src=canvas.toDataURL('image/png');image.alt=map.name+'俯视占位图';image.dataset.filename=map.file;$('[data-map-title]').textContent=map.file+' · 占位图';all('[data-map-id]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapId===state.mapId)));$('[data-map-layout]').classList.toggle('is-collapsed',state.mapCollapsed);$('[data-map-tree]').hidden=state.mapCollapsed;$('[data-toggle-map-tree]').textContent=state.mapCollapsed?'目录':'收起';$('[data-toggle-map-tree]').setAttribute('aria-expanded',String(!state.mapCollapsed));
  }
  function getAppearance(){storeAppearance();return {displayPreset,appearanceProfiles:JSON.parse(JSON.stringify(appearanceProfiles))};}
  function save(){onAppearanceChange(getAppearance());}
  function setAppearance(snapshot){
    if(!snapshot||typeof snapshot!=='object')return;
    if(Object.hasOwn(displayPresets,snapshot.displayPreset))displayPreset=snapshot.displayPreset;
    if(snapshot.appearanceProfiles&&typeof snapshot.appearanceProfiles==='object')for(const key of Object.keys(displayPresets))if(snapshot.appearanceProfiles[key])appearanceProfiles[key]=validatedAppearance(snapshot.appearanceProfiles[key]);
    loadAppearance();renderTheme();layoutFrame();renderPage();
  }
  function clear(){cancelResource(false);stopRing(true);closeCrop();$('.p-settings').open=false;state.role=null;state.page='首页';state.confirmed=null;renderIdentity();renderPage();onIdentityChange(null);announce('请选择身份');}
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(button.hasAttribute('data-appearance-retry')){onAppearanceRetry();return;}
    if(button.hasAttribute('data-home-identity')){goPage('首页');return;}
    if(button.dataset.role){state.role=button.dataset.role==='DM'?'DM':'Player';state.page='首页';renderIdentity();renderPage();onIdentityChange(state.role.toLowerCase());announce(state.role==='DM'?'主持人视角':'玩家视角');save();return;}
    if(button.hasAttribute('data-change-role')){clear();return;}
    if(!state.role)return;
    if(button.hasAttribute('data-open-crop')){openCrop();return;}
    if(button.hasAttribute('data-crop-cancel')){closeCrop();return;}
    if(button.hasAttribute('data-crop-apply')){applyCrop();return;}
    if(button.hasAttribute('data-crop-full')){if(cropDraft){cropDraft.mode='contain';renderCropPreview();}return;}
    if(button.dataset.page){goPage(button.dataset.page);return;}
    if(button.hasAttribute('data-browse-modules')){const chosen=findModule(state.confirmed);if(chosen){state.group=chosen.group;state.moduleIndex=chosen.index;buildCovers();}goPage('模组');return;}
    if(button.dataset.group){state.group=button.dataset.group;state.moduleIndex=0;buildCovers();renderSegment();announce(groups[state.group].name);save();return;}
    if(button.hasAttribute('data-module-index')){if(performance.now()>=suppressRingClick)chooseModule(Number(button.dataset.moduleIndex));return;}
    if(button.hasAttribute('data-module-step')){stepModule(Number(button.dataset.moduleStep));return;}
    if(button.hasAttribute('data-confirm-module')){if(Math.abs(ringTarget-ringAngle)>.003)return;state.confirmed=items()[state.moduleIndex].id;updateModuleUI();renderHome();announce('已选择'+items()[state.moduleIndex].name);save();return;}
    if(button.dataset.resource){if(performance.now()<suppressResourceClick)return;const index=categories.indexOf(button.dataset.resource);if(state.drawerOpen&&state.resourceIndex===index)closeDrawer();else openDrawer(index,event.detail===0);return;}
    if(button.hasAttribute('data-resource-step')){stepResource(Number(button.dataset.resourceStep));return;}
    if(button.hasAttribute('data-close-drawer')){closeDrawer();$(`[data-resource="${categories[state.resourceIndex]}"]`).focus({preventScroll:true});return;}
    if(button.dataset.info){state.infoSelection=button.dataset.info;all('[data-info]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));$('[data-resource-selection]').textContent='已选：'+state.infoSelection;announce('已选'+state.infoSelection);return;}
    if(button.dataset.mapId&&Object.hasOwn(maps,button.dataset.mapId)){state.mapId=button.dataset.mapId;renderMap();announce(maps[state.mapId].name);save();return;}
    if(button.hasAttribute('data-toggle-map-tree')){state.mapCollapsed=!state.mapCollapsed;renderMap();save();}
  });
  root.addEventListener('input',event=>{const input=event.target;if(input.dataset.appearanceValue){theme[input.dataset.appearanceValue]=Number(input.value);renderTheme();save();return;}if(input.dataset.cropValue&&cropDraft){cropDraft[input.dataset.cropValue]=Number(input.value);renderCropPreview();return;}if(input.hasAttribute('data-floor-percent')){theme.floorPercent=Number(input.value);renderFloor();save();}else if(input.dataset.color){theme[input.dataset.color]=input.value;theme.preset='custom';renderTheme();save();}else if(input.dataset.gradient){gradient[input.dataset.gradient]=input.value;renderGradient();save();}});
  root.addEventListener('change',event=>{const input=event.target;if(input.hasAttribute('data-crop-mode')&&cropDraft){cropDraft.mode=input.value==='crop'?'crop':'contain';renderCropPreview();return;}if(input.hasAttribute('data-display-preset')){switchDisplay(input.value);return;}if(input.hasAttribute('data-preset')&&Object.hasOwn(presets,input.value)){Object.assign(theme,presets[input.value],{preset:input.value});renderTheme();save();}});
  root.addEventListener('keydown',event=>{if(!state.role)return;if(event.key==='Escape'){$('.p-settings').open=false;if(state.page==='资源'&&resourcePhase!=='closed'){event.preventDefault();closeDrawer();}return;}if(event.target.closest('[data-ring]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home'||event.key==='End')chooseModule(event.key==='Home'?0:items().length-1,true);else stepModule(event.key==='ArrowRight'?1:-1,true);}else if(event.target.closest('[data-resource-track]')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();stepResource(event.key==='ArrowRight'?1:-1,true);}});
  const ring=$('[data-ring]');
  ring.addEventListener('wheel',event=>{if(event.ctrlKey||items().length<2)return;event.preventDefault();const now=performance.now(),delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;if(!delta||now-wheelTime<160)return;wheelTime=now;stepModule(delta>0?1:-1);},{passive:false});
  ring.addEventListener('pointerdown',event=>{if(event.button!==0)return;ringPointer={x:event.clientX,y:event.clientY,angle:ringAngle,dragging:false};});
  ring.addEventListener('pointermove',event=>{if(!ringPointer)return;const dx=event.clientX-ringPointer.x,dy=event.clientY-ringPointer.y;if(!ringPointer.dragging&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){ringPointer.dragging=true;stopRing(false);ring.setPointerCapture(event.pointerId);}if(ringPointer.dragging){event.preventDefault();ringAngle=ringTarget=ringPointer.angle+dx*2*Math.PI/items().length/80;state.moduleIndex=mod(-Math.round(ringAngle/(2*Math.PI/items().length)),items().length);drawRing();updateModuleUI();}});
  const endRingDrag=event=>{if(!ringPointer)return;const dragging=ringPointer.dragging;ringPointer=null;if(ring.hasPointerCapture(event.pointerId))ring.releasePointerCapture(event.pointerId);if(dragging){suppressRingClick=performance.now()+350;const step=2*Math.PI/items().length;ringTarget=Math.round(ringAngle/step)*step;state.moduleIndex=mod(-Math.round(ringTarget/step),items().length);animateRing();save();}};
  ring.addEventListener('pointerup',endRingDrag);ring.addEventListener('pointercancel',endRingDrag);
  const track=$('[data-resource-track]');
  track.addEventListener('pointerdown',event=>{if(resourcePhase==='closed'&&event.pointerType==='mouse'&&event.button===0)resourcePointer={x:event.clientX,left:track.scrollLeft,dragging:false};});
  track.addEventListener('pointermove',event=>{if(!resourcePointer)return;if(!(event.buttons&1)){resourcePointer=null;track.classList.remove('is-dragging');return;}const dx=event.clientX-resourcePointer.x;if(!resourcePointer.dragging&&Math.abs(dx)>8){resourcePointer.dragging=true;track.classList.add('is-dragging');track.setPointerCapture(event.pointerId);}if(resourcePointer.dragging){event.preventDefault();track.scrollLeft=resourcePointer.left-dx;}});
  const endResourceDrag=event=>{if(!resourcePointer)return;const dragging=resourcePointer.dragging;resourcePointer=null;track.classList.remove('is-dragging');if(track.hasPointerCapture(event.pointerId))track.releasePointerCapture(event.pointerId);if(dragging){suppressResourceClick=performance.now()+350;const left=track.scrollLeft+parseFloat(getComputedStyle(track).paddingLeft),positions=all('[data-resource]').map(button=>Math.abs(button.offsetLeft-track.offsetLeft-left));state.resourceIndex=positions.indexOf(Math.min(...positions));updateResourceCards();scrollResource(state.resourceIndex);save();}};
  track.addEventListener('pointerup',endResourceDrag);track.addEventListener('pointercancel',endResourceDrag);
  track.addEventListener('scroll',()=>{if(resourcePhase!=='closed')return;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(!state.role||state.page!=='资源'||resourcePhase!=='closed'||resourcePointer?.dragging)return;const left=track.scrollLeft+parseFloat(getComputedStyle(track).paddingLeft),positions=all('[data-resource]').map(button=>Math.abs(button.offsetLeft-track.offsetLeft-left)),index=positions.indexOf(Math.min(...positions));if(index===state.resourceIndex)return;state.resourceIndex=index;state.infoSelection=null;updateResourceCards();save();},140);},{passive:true});
  root.addEventListener('pointermove',event=>{const button=event.target.closest('.p-button');if(!button||event.pointerType==='touch'||button.classList.contains('p-resource-flight'))return;const box=button.getBoundingClientRect(),x=clamp((event.clientX-box.left)/box.width,0,1),y=clamp((event.clientY-box.top)/box.height,0,1);button.style.setProperty('--rx',((.5-y)*6)+'deg');button.style.setProperty('--ry',((x-.5)*8)+'deg');button.style.setProperty('--px',x*100+'%');button.style.setProperty('--py',y*100+'%');});
  root.addEventListener('pointerout',event=>{const button=event.target.closest('.p-button');if(!button||button.contains(event.relatedTarget))return;button.style.setProperty('--rx','0deg');button.style.setProperty('--ry','0deg');});
  buildCovers();renderTheme();renderInfo();updateResourceCards();renderPage();renderIdentity();$('[data-title]').tabIndex=-1;
  $('[data-crop-dialog]').addEventListener('close',()=>{if(!$('[data-crop-dialog]').open){cropDraft=null;cropSource=null;}});
  $('.p-crop-json').addEventListener('toggle',()=>{if($('[data-crop-dialog]').open)requestAnimationFrame(renderCropPreview);});
  const cropObserver=new ResizeObserver(()=>{if($('[data-crop-dialog]').open)renderCropPreview();});cropObserver.observe($('[data-crop-stage]'));
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(app.clientWidth!==lastWidth&&resourcePhase==='moving')cancelResource(false);layoutFrame();layoutCrop();});});observer.observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRing(true);ringPointer=null;cancelResource(state.drawerOpen);}drawRing();updateModuleUI();});
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',()=>{if(reduced()){stopRing(true);drawRing();updateModuleUI();if(resourcePhase==='moving')openDrawer(state.resourceIndex);}});
  return {root:wrapper,show:goPage,clear,setAppearance,getAppearance,
    setConnection(connected){$('#platform-connection').textContent=connected?'独立本机平台':'本机连接暂不可用';},
    setAppearanceReady(ready){all('[data-display-preset],[data-preset],[data-color],[data-gradient],[data-floor-percent],[data-appearance-value]').forEach(input=>{input.disabled=!ready;});},
    setAppearanceStatus(text,{canRetry=false,conflict=false}={}){$('[data-appearance-status]').textContent=text;$('.p-appearance-status').dataset.conflict=String(conflict);$('[data-appearance-retry]').hidden=!canRetry;},
    get page(){return pageKeys[state.page];},get role(){return state.role?.toLowerCase()||null;}
  };
}
