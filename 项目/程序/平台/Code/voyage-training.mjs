import { createClassTestActors } from '../../战斗/Code/src/testing-presets.mjs';
import { requireRule, validateActor } from '../../战斗/Code/src/rules.mjs';

export const VOYAGE_TRAINING = Object.freeze({
  title: '甲板战斗与保存练习',
  summary: '用一名合成训练战士完成准备、移动、普通攻击和重开恢复；梅洛的行动由主持人手动选择。',
  characterNotes: '训练角色复用PHB2024战士·勇士20级资源测试预设。HP100、AC15、速度30尺、普通近战攻击+11／1d6+5钝击、每次攻击动作最多4次攻击，均为原预设的合成训练数值；不是完整合法角色卡，也不代表平衡遭遇。完整职业效果仍须主持核对。',
  steps: Object.freeze([
    '准备：查看训练战士和梅洛的资料，逐个核对并保存，再提交先攻、开始战斗；载入本身不会确认角色或开战。',
    '移动：轮到训练战士时先走5尺，观察位置、已用移动力和保存版本一起变化。',
    '攻击：移动到近战触及内，选择训练攻击；程序掷骰或录入真实线下骰，观察攻击次数和目标生命变化。',
    '规则拒绝：尝试超过本回合剩余移动力的落点，核对错误提示；被拒绝的操作不应改变位置、资源和进度版本。',
    '主持回合：点击下一回合后，由主持人选择梅洛的移动和攻击；不会自动执行NPC战术。',
    '保存恢复：看到保存成功后关闭再打开同一团，核对最近成功操作的位置、生命和回合仍在；最后由主持人结束本场。',
    '开发思路：沿“界面收集输入→统一操作入口→本地规则检查→候选状态→文件保存成功后确认正式状态”解释刚才的一次动作。'
  ])
});

export function applyVoyageTraining(state) {
  requireRule(state?.combat?.phase === 'preparing' && state.revision === 0,
    '训练预设仅用于尚未操作的新建战斗，不覆盖已有游玩进度');
  const playerIndices = state.actors?.flatMap((actor, index) => actor.kind === 'pc' ? [index] : []);
  requireRule(playerIndices?.length === 1, '训练场须有且仅有一个待替换的玩家角色');
  const index = playerIndices[0], previous = state.actors[index];
  const actor = createClassTestActors({ batch: 1 }).find(entry =>
    entry.classTestProfile.classId === 'fighter' && entry.classTestProfile.subclassId === 'champion');
  Object.assign(actor, {
    id: previous.id,
    ownerId: previous.ownerId,
    name: '甲板训练战士（合成角色）',
    position: structuredClone(previous.position),
    tiePriority: previous.tiePriority,
    confirmed: false,
    notes: VOYAGE_TRAINING.characterNotes + ' ' + actor.notes
  });
  actor.attacks[0].name = '训练近战（合成数值）';
  validateActor(actor, state.board);
  state.actors[index] = actor;
  return state;
}
