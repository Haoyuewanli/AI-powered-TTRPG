import {el} from '/resource-icons.mjs';
const paths={
  sword:'M5 21l4-4m-3-3 4 4M9 14 19 3l2 2-10 11M4 17l3 3',
  bow:'M5 3q23 9 0 18L8 12 5 3m3 9h14m-4-4 4 4-4 4',
  run:'M14 3h1m-3 5 3-2 3 4 3 1M6 10l4-3 4 5-3 4-1 6m1-6-6 2M4 5h4M2 12h4',
  shield:'M12 3 3 6v6q1 7 9 10 8-3 9-10V6L12 3zm-4 9 3 3 5-6',
  exit:'M10 4H4v16h6m1-8h11m-5-5 5 5-5 5',
  hand:'M6 12V7q2-3 3 0v5-9q2-3 3 0v9-8q2-3 3 0v8-5q2-2 3 0v9q0 6-6 6H9L3 15q0-4 3-1',
  eye:'M2 12q10-15 20 0-10 15-20 0zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  voice:'M4 5h16v11H9l-5 5V5zm4 4h8m-8 3h5',
  spark:'M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7z',
  clock:'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 4v7l5 3',
  book:'M12 5Q5 1 2 4v16q5-3 10 0 5-3 10 0V4q-3-3-10 1v15',
  fist:'M5 10V6h4V4h4v1h4v2h3v10l-5 5H8l-4-6V9l5 4',
  push:'M2 12h14m-5-5 5 5-5 5m9-14v18',
  throw:'M4 21l3-9 5-4 5 2m-5-2 2-5m3 0q6 3 4 9M3 14l4-2 4 6m3-15h1',
  jump:'M2 20q10-26 20 0M16 17l6 3-1-7',
  climb:'M5 22 9 2m6 20 4-20M8 6h10M7 12h10M6 18h10',
  stand:'M12 2h1m-1 5v8m-7-5 7-3 7 3m-7 5-5 7m5-7 5 7',
  drop:'M12 2q-2 6-7 11a8 8 0 1 0 14 0q-5-5-7-11z',
  bottle:'M9 2h6v5l4 5v9H5v-9l4-5V2zm-4 13h14',
  star:'M12 2l3 6 7 2-5 5 1 7-6-4-6 4 1-7-5-5 7-2 3-6z'
};
export function actionIcon(name) {
  const wrap=el('span','','operation-icon'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[name]||paths.star);svg.append(path);wrap.append(svg);return wrap;
}
