const palette = { fire:'#ff6a32',cold:'#79d5ff',force:'#c994ff',radiant:'#ffe69b',necrotic:'#8860ad',poison:'#7ac65b',acid:'#b7ec4c',lightning:'#ffe368',thunder:'#8f9dff',psychic:'#eb78c0' };
export function combatVisual(state, command) {
  if (!['attack', 'use-operation'].includes(command.type)) return null;
  const payload = command.payload, actor = state.actors.find(actor => actor.id === payload.actorId);
  if (!actor) return null;
  const attack = actor.attacks.find(attack => attack.id === payload.attackId), operation = actor.operations?.find(operation => operation.id === payload.operationId);
  const label = String(attack?.name || '');
  const families = [['crossbow', /弩|crossbow/i], ['bow', /弓|\bbow\b/i], ['dagger', /匕首|dagger/i], ['scimitar', /刀|scimitar|saber/i], ['axe', /斧|axe/i], ['staff', /杖|staff/i], ['club', /棍|棒|club/i], ['sword', /剑|sword/i], ['spear', /矛|spear/i], ['hammer', /锤|hammer/i], ['mace', /钉头槌|mace/i], ['halberd', /戟|halberd/i], ['flail', /链枷|flail/i], ['sickle', /镰|sickle/i]];
  const weapon = families.find(([, pattern]) => pattern.test(label))?.[0] || actor.appearance?.weapon || (actor.kind === 'npc' ? 'none' : attack?.kind === 'ranged' ? 'bow' : 'sword');
  const magic = operation?.category === 'spells' || /法术|魔法|射线|spell|ray/i.test(label);
  const type = payload.result?.damage?.[0]?.type || attack?.damage?.[0]?.type;
  const colors = Object.values(palette), colorIndex = [...String(operation?.id || '')].reduce((sum, char) => sum + char.codePointAt(0), 0) % colors.length;
  return { actorId: actor.id, ...(payload.targetId ? { targetId: payload.targetId } : {}), kind: magic ? 'magic' : 'weapon', weapon, color: palette[type] || (magic ? colors[colorIndex] : '#ccc5b0') };
}
