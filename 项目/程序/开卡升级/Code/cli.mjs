import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { ROOT, loadLibrary, buildLibrary } from './library.mjs';
import { STORE, createCharacter, continueCharacter, rollCharacter, changeMode, upgradeCharacter, recover, checkedPath, listCharacters } from './store.mjs';

function report(value){
  if(value.dir)console.log('玩家文件夹：'+join(value.dir,'玩家文件'));
  if(value.complete||value.state?.status==='complete'){console.log(value.checkOnly?'检查通过，保存并继续即可生成成果。':'角色已完成，角色卡保存在本角色的“成果”文件夹。');return;}
  const r=value.result;if(!r)return;
  if(r.issues.length)console.log(r.issues.map(e=>e.message).join('\n'));
  console.log(`还需填写${r.missing.length}项。按“本轮说明.txt”填写后继续。`);
}
function reveal(dir){if(process.platform==='win32')spawn('explorer.exe',[join(dir,'玩家文件')],{detached:true,stdio:'ignore',windowsHide:true}).unref();}
async function main(){
  const lib=await loadLibrary(),[cmd='menu',arg,...args]=process.argv.slice(2);
  if(cmd==='build'){const m=await buildLibrary(lib);console.log(`TXT库已生成：${m.files}份；12职业、${m.subclasses}子职、${m.spells}道法术、${m.beasts}种附录野兽。`);return;}
  if(cmd==='list'){console.log(JSON.stringify(await listCharacters(),null,2));return;}
  if(cmd==='new'){
    const flags={};const tokens=[arg,...args].filter(x=>x!==undefined);for(let i=0;i<tokens.length;i+=2){if(!['--mode','--class','--level','--name'].includes(tokens[i])||tokens[i+1]===undefined)throw new Error('new参数：--mode 引导|自由 --class 职业 --level 等级 --name 名称');flags[tokens[i]]=tokens[i+1];}
    const answers={};for(const [flag,key] of [['--class','职业'],['--level','目标等级'],['--name','角色名']])if(flags[flag])answers[key]=flags[flag];
    const value=await createCharacter(lib,{mode:flags['--mode']||'引导',answers});report(value);return;
  }
  if(cmd!=='menu'){
    if(!arg)throw new Error('请提供角色存档目录，使用list查看。');const dir=await checkedPath(arg);
    if(cmd==='continue')report(await continueCharacter(lib,dir));
    else if(cmd==='check')report(await continueCharacter(lib,dir,{checkOnly:true}));
    else if(cmd==='roll')report(await rollCharacter(lib,dir));
    else if(cmd==='mode')report(await changeMode(lib,dir,args[0]));
    else if(cmd==='upgrade')report(await upgradeCharacter(lib,dir,Number(args[0])));
    else if(cmd==='recover')report(await recover(lib,dir));
    else throw new Error('未知操作。支持new、list、continue、check、roll、mode、upgrade、recover、build。');
    return;
  }
  const input=createInterface({input:stdin,output:stdout,terminal:false});
  try{
    console.log('本地开卡与升级\n1 新建角色\n2 打开已有角色\n3 升级\n4 切换填写模式\n5 生成骰点\n6 恢复当前文件\n7 重建TXT库');
    const action=(await input.question('选择：')).trim();
    if(action==='7'){const m=await buildLibrary(lib);console.log('已生成'+m.files+'份资料。');return;}
    if(action==='1'){
      const mode=(await input.question('1 分轮引导  2 自由填写：')).trim();if(!['1','2'].includes(mode))throw new Error('请选择1或2。');
      const value=await createCharacter(lib,{mode:mode==='2'?'自由':'引导'});report(value);reveal(value.dir);return;
    }
    const entries=await listCharacters();if(!entries.length){console.log('还没有角色，请先新建。');return;}
    entries.forEach((e,i)=>console.log(`${i+1} ${e.name} ${e.level}级${e.className} (${e.mode})`));
    const choice=Number(await input.question('角色编号：')),entry=entries[choice-1];if(!entry)throw new Error('编号无效。');
    const dir=await checkedPath(entry.dir);
    if(action==='2')reveal(dir);
    else if(action==='3'){report(await upgradeCharacter(lib,dir,Number(await input.question('升到几级：'))));reveal(dir);}
    else if(action==='4'){const mode=(await input.question('1 分轮引导  2 自由填写：')).trim();if(!['1','2'].includes(mode))throw new Error('请选择1或2。');report(await changeMode(lib,dir,mode==='2'?'自由':'引导'));reveal(dir);}
    else if(action==='5'){report(await rollCharacter(lib,dir));reveal(dir);}
    else if(action==='6'){report(await recover(lib,dir));reveal(dir);}
    else throw new Error('请选择有效操作。');
  }finally{input.close();}
}
main().catch(e=>{console.error('未完成：'+e.message);process.exitCode=1;});
