const $ = id => document.getElementById(id);
const option = (value, title) => { const item = document.createElement('option'); item.value = value; item.textContent = title; return item; };

export function workspacePanel({ api, apply, notify, getState, canSwitch }) {
  let catalog, contextKey = '', request = 0, working = false;
  const guard = fn => async event => { event?.preventDefault(); if (working) return; working = true; try { await fn(); } catch (error) { if (!error.cancelled) notify(error.message, true); } finally { working = false; } };
  function fillBattles(campaignId) {
    const campaign = catalog?.campaigns.find(c => c.id === campaignId);
    $('battle-select').replaceChildren(...(campaign?.battles || []).map(b => option(b.id, b.name)));
  }
  async function refresh() {
    if (getState()?.viewRole !== 'dm') return;
    const pending = ++request;
    {
      const value = await api('/api/catalog');
      if (pending !== request || getState()?.viewRole !== 'dm') return;
      catalog = value;
      $('campaign-select').replaceChildren(...value.campaigns.map(c => option(c.id, c.name)));
      $('campaign-select').value = value.campaignId; fillBattles(value.campaignId); $('battle-select').value = value.battleId;
      const campaign = value.campaigns.find(c => c.id === value.campaignId);
      $('battle-template').replaceChildren(option('', '空白战斗（待填写角色）'), ...campaign.battles.map(b => option(b.id, `复制 ${b.name} 的当前状态`)));
      $('battle-template').value = value.battleId;
    }
  }
  $('campaign-select').addEventListener('change', () => fillBattles($('campaign-select').value));
  $('open-battle').addEventListener('click', guard(async () => {
    if (!canSwitch()) return;
    apply(await api('/api/select', { campaignId: $('campaign-select').value, battleId: $('battle-select').value }));
    notify('已从本地文件打开所选战斗');
  }));
  $('new-campaign-form').addEventListener('submit', guard(async () => {
    if (!canSwitch()) return;
    apply(await api('/api/campaigns', { name: $('new-campaign-name').value, copyCurrent: $('copy-current-campaign').checked }));
    $('new-campaign-name').value = ''; notify('新团已保存在本机');
  }));
  $('new-battle-form').addEventListener('submit', guard(async () => {
    if (!canSwitch()) return;
    apply(await api('/api/battles', { name: $('new-battle-name').value, templateBattleId: $('battle-template').value || undefined }));
    $('new-battle-name').value = ''; notify('新战斗已建立；原战斗不变');
  }));
  return {
    render(state, selection) {
      $('workspace-panel').hidden = state.viewRole !== 'dm';
      $('context-caption').textContent = selection ? `${selection.campaignName} / ${selection.battleName}` : state.title;
      const key = `${state.campaignId}/${state.battleId}`;
      if (state.viewRole === 'dm' && contextKey !== key) { contextKey = key; refresh().catch(error => { if (!error.cancelled) notify(error.message, true); }); }
    },
    clear() {
      request++; contextKey = ''; catalog = null;
      for (const id of ['campaign-select', 'battle-select', 'battle-template']) $(id).replaceChildren();
      $('context-caption').textContent = '';
    }
  };
}
