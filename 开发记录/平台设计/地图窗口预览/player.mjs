const token = location.hash.slice(1);
const host = document.getElementById('images'), empty = document.getElementById('empty');
let pending = false;

function render(urls) {
  const allowed = new Set(urls);
  for (const image of [...host.querySelectorAll('img')]) if (!allowed.has(image.getAttribute('src'))) { image.removeAttribute('src'); image.remove(); }
  for (const url of urls) if (![...host.querySelectorAll('img')].some(image => image.getAttribute('src') === url)) {
    const image = document.createElement('img'); image.alt = '共享地图图片'; image.referrerPolicy = 'no-referrer'; image.src = url; host.append(image);
  }
  empty.hidden = urls.length > 0;
}

async function refresh() {
  if (pending) return;
  pending = true;
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('接收链接无效');
    const response = await fetch('/api/images', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    if (!response.ok) throw Error('接收链接无效');
    const value = await response.json();
    if (!Array.isArray(value.images) || value.images.some(url => typeof url !== 'string' || !/^\/image\/[A-Za-z0-9_-]{43}$/.test(url))) throw Error('图片暂不可用');
    render(value.images); empty.textContent = '还没有获取地图╮(╯▽╰)╭';
  } catch (failure) { render([]); empty.textContent = failure.message === '接收链接无效' ? '接收链接无效，请使用主持人提供的链接。' : '图片暂不可用，正在重新连接。'; }
  finally { pending = false; }
}

await refresh();
setInterval(refresh, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
