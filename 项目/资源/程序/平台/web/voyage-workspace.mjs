const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, action, key) => {
  const node = el('button', text, 'project-button');
  node.type = 'button'; node.addEventListener('click', action);
  if (key) node.dataset[key] = '';
  return node;
};
const readable = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(readable).filter(Boolean).join('\n')
  : value && typeof value === 'object' ? readable(value.text || value.description || value.content) : '';

export function createVoyageWorkspace({ host, api, mutate, run, enterBattle, report }) {
  const panel = el('details', undefined, 'project-training');
  panel.dataset.voyageTraining = ''; panel.hidden = true;
  const summary = el('summary', '甲板试玩 · 场景、记录与开发思路');
  const body = el('div', undefined, 'project-training-body');
  panel.append(summary, body); host.prepend(panel);
  let generation = 0, dirty = false, saving = false, baseline = null;
  let notes, outcome, status;

  function clear() {
    generation++; dirty = false; saving = false; baseline = null;
    body.replaceChildren(); panel.hidden = true; panel.open = false;
  }
  async function load(content) {
    clear();
    if (content.training?.kind !== 'voyage-training-v1') return;
    const current = generation;
    const saved = await api('/api/project/module-state?kind=' + encodeURIComponent('故事进度'));
    if (current !== generation) return;
    baseline = structuredClone(saved.state || {});
    const record = baseline.training || {}, identity = content.templateIdentity || {};
    panel.hidden = false; panel.open = true;
    const heading = el('h3', content.name + ' · 独立试玩');
    body.append(heading, el('p', '资料批次：' + (identity.batchId || '旧版无批次') + '；本段使用2024规则梅洛和示意甲板。整本资料仍保留原核对状态。'));
    body.append(el('p', '先读开场并决定行动。谈判、创意行动或战斗均可；主持选择NPC行动，程序校验并保存机械结果。'));
    const scene = el('section', undefined, 'project-training-scene'), tabs = el('div', undefined, 'project-training-actions');
    const description = el('article'); description.dataset.trainingScene = '';
    const nodes = content.training.sceneNodes || [];
    function showNode(node) {
      description.replaceChildren(el('h4', node.title || node.id), el('p', node.description || '本节点说明待核对。'));
      const aloud = readable(node.readAloud);
      if (aloud) description.append(el('p', aloud));
      const source = node.source || {};
      const range = Array.isArray(source.lines) ? source.lines : source.lineStart ? [source.lineStart, source.lineEnd || source.lineStart] : null;
      const lines = range ? '，第' + range[0] + '～' + range[1] + '行' : '';
      description.append(el('small', '来源：' + (source.mdPath || source.path || source.relativePath || '当前资料包节点') + lines));
      for (const item of tabs.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.trainingSceneNode === node.id));
    }
    for (const node of nodes) {
      const choose = button(node.title || node.id, () => showNode(node));
      choose.dataset.trainingSceneNode = node.id; tabs.append(choose);
    }
    if (nodes.length) showNode(nodes[0]);
    else description.append(el('p', '未找到本段来源节点，请核对资料包后再继续。'));
    scene.append(tabs, description); body.append(scene);

    const lesson = el('details', undefined, 'project-training-lesson');
    lesson.append(el('summary', '跟着一次“移动5尺”理解开发'));
    const steps = el('ol');
    for (const text of [
      '界面：选择棋子和目的地，先分清你提交了什么。',
      '统一入口：确认当前团、战斗、操作者和进度版本。',
      '规则：检查回合、移动距离、阻挡和剩余移动力。',
      '存档：生成候选结果；本地文件写入成功，才成为正式进度。',
      '反馈：界面显示新位置、剩余移动力和“已保存”的版本。',
      '反例：尝试超过剩余移动力，确认位置、资源和正式进度不变。',
      '恢复：保存后关闭重开，确认仍是最近一次成功操作的结果。'
    ]) steps.append(el('li', text));
    lesson.append(steps, el('p', '自己试着回答：为什么规则还要在统一入口检查？被拒绝后什么应该不变？重开丢进度时，需要提供哪些证据？'));
    body.append(lesson);

    const label = el('label', '本段结果 ');
    outcome = el('select'); outcome.dataset.trainingOutcome = '';
    outcome.setAttribute('aria-label', '本段试玩结果');
    for (const [value, text] of [['in-progress', '进行中'], ['negotiated', '交涉结束'], ['retreated', '撤离结束'], ['combat-ended', '战斗已结束'], ['other', '其他结果']]) {
      const option = el('option', text); option.value = value; outcome.append(option);
    }
    outcome.value = ['in-progress', 'negotiated', 'retreated', 'combat-ended', 'other'].includes(record.outcome) ? record.outcome : 'in-progress';
    notes = el('textarea'); notes.rows = 3; notes.dataset.trainingNotes = '';
    notes.setAttribute('aria-label', '本段试玩记录'); notes.placeholder = '记录你做了什么、发生了什么，以及还没解决的事情。';
    notes.value = typeof record.notes === 'string' ? record.notes : '';
    status = el('p', record.notes || record.outcome ? '已读取本段的本地记录。' : '记录尚未填写；写下结果后保存。', 'project-notice');
    status.dataset.trainingStatus = ''; status.setAttribute('role', 'status');
    report?.(status.textContent);
    const changed = () => { dirty = true; status.textContent = '本段记录有未保存草稿。'; };
    notes.addEventListener('input', changed); outcome.addEventListener('change', changed);
    label.append(outcome); body.append(label, notes);
    const actions = el('div', undefined, 'project-training-actions');
    const save = button('保存本段记录', () => run(async () => {
      if (saving) return;
      saving = true; save.disabled = true;
      const draft = { notes: notes.value, outcome: outcome.value };
      try {
        const state = { ...baseline, training: { ...baseline.training, ...draft } };
        let value;
        for (let attempt = 0; attempt < 3; attempt++) {
          const latest = await api('/api/project/module-state?kind=' + encodeURIComponent('故事进度'));
          if (current !== generation) return;
          if (JSON.stringify(latest.state || {}) !== JSON.stringify(baseline)) throw new Error('故事记录已在别处更新；草稿已保留，请核对后重新读取。');
          try { value = await mutate('module-state', { kind: '故事进度', state, expectedRevision: latest.revision }); break; }
          catch (error) {
            if (attempt === 2 || error.status !== 409 || !/文件管理版本已变化|文件管理正被另/.test(error.message)) throw error;
            await new Promise(accept => setTimeout(accept, 150));
          }
        }
        if (current !== generation) return;
        baseline = structuredClone(value.state || state);
        dirty = notes.value !== draft.notes || outcome.value !== draft.outcome;
        status.textContent = dirty ? '先前内容已保存，本页还有新草稿。' : '本段记录已保存到本地文件，重开可继续。';
        report?.(status.textContent);
      } catch (error) {
        if (current === generation) status.textContent = error.message + ' 当前草稿仍保留。';
        throw error;
      } finally {
        if (current === generation) { saving = false; save.disabled = false; }
      }
    }), 'trainingSave');
    const refresh = button('重新读取已保存记录', () => run(async () => {
      if (saving) return;
      if (dirty) { status.textContent = '草稿仍保留；要放弃草稿，请使用“放弃草稿并重读”。'; return; }
      await load(content);
    }), 'trainingRefresh');
    const discard = button('放弃草稿并重读', () => run(async () => { if (!saving) await load(content); }), 'trainingDiscard');
    const enter = button('进入训练战斗', () => run(async () => { if (await enterBattle()) panel.open = false; }), 'trainingEnterBattle');
    actions.append(save, refresh, discard, enter); body.append(actions, status);
    body.append(el('small', '结果记录不会自动结束战斗或改变HP；机械结果以战斗日志和存档为准。'));
  }
  return { load, clear, canLeave: () => !dirty && !saving, hasDraft: () => dirty || saving };
}
