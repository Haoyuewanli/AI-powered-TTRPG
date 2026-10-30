import {createDesignWorkspace} from '/official/design-workspace.mjs';
const view=createDesignWorkspace();
view.setAppearanceReady(true);
view.setAppearanceStatus('原设计示例 · 独立预览，不写真实资料');
document.querySelector('#platform-connection').textContent='原设计示例';
const note=document.createElement('p');note.style.cssText='padding:8px 20px';
const link=document.createElement('a');link.href='/';link.textContent='返回目录驱动预览';
note.append(link);document.body.prepend(note);
