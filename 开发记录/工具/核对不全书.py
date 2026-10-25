"""核对固定上游快照，生成本地查阅入口；只使用 Python 标准库。"""
import argparse
import hashlib
import html
import json
import posixpath
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit
from zipfile import ZipFile

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / '项目' / '资料' / '5E不全书'


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def decode(raw):
    try:
        return raw.decode('utf-8-sig'), 'utf-8'
    except UnicodeDecodeError:
        return raw.decode('gb18030'), 'gb18030'


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []
        self.links = []
        self.title_parts = []
        self.in_title = False
        self.link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'a':
            self.link = [attrs.get('href', ''), []]
        for attribute in ('href', 'src', 'poster', 'data'):
            if attribute in attrs:
                self.refs.append((tag, attribute, attrs[attribute]))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'a' and self.link is not None:
            self.links.append((self.link[0], ''.join(self.link[1]).strip()))
            self.link = None

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if self.link is not None:
            self.link[1].append(data)


def local_target(current, ref):
    ref = ref.strip().replace('\\', '/')
    if not ref or ref.startswith('#'):
        return None, 'fragment'
    parsed = urlsplit(ref)
    if parsed.scheme or parsed.netloc:
        return None, 'external' if parsed.scheme in ('http', 'https') or parsed.netloc else 'special'
    path = unquote(parsed.path)
    if not path:
        return None, 'fragment'
    target = posixpath.normpath(path.lstrip('/') if path.startswith('/') else posixpath.join(posixpath.dirname(current), path))
    return target, 'local'


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify_archive(config, extract):
    originals = LIBRARY / '原始发布'
    for kind in ('chm', 'web'):
        expected = config[kind]
        path = originals / expected['filename']
        if path.stat().st_size != expected['bytes'] or sha256(path) != expected['sha256']:
            raise ValueError(f'{kind} 文件大小或 SHA-256 不匹配')
    if (originals / config['chm']['filename']).read_bytes()[:4] != b'ITSF':
        raise ValueError('原始 CHM 文件头不正确')
    tree = json.loads((originals / config['web']['tree_filename']).read_text(encoding='utf-8-sig'))
    if tree.get('truncated'):
        raise ValueError('上游清单被截断')
    expected = {entry['path']: entry for entry in tree['tree'] if entry['type'] == 'blob'}
    if len(expected) != config['web']['expected_files']:
        raise ValueError('上游文件数与来源记录不符')
    target = LIBRARY / '网页'
    with ZipFile(originals / config['web']['filename']) as archive:
        if archive.testzip():
            raise ValueError('ZIP CRC 检查失败')
        prefix = f"5echm_web-{config['web']['revision']}/"
        contents = {}
        for entry in archive.infolist():
            if not entry.filename.startswith(prefix):
                raise ValueError('ZIP 根目录与固定版本不符')
            relative = entry.filename[len(prefix):]
            if not relative or entry.is_dir():
                continue
            path = PurePosixPath(relative)
            if path.is_absolute() or '..' in path.parts or ':' in relative or '\\' in relative:
                raise ValueError('ZIP 包含越界路径')
            if entry.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError('ZIP 包含符号链接，需要单独检查')
            if relative in contents:
                raise ValueError('ZIP 包含重复文件路径')
            contents[relative] = entry
        if set(contents) != set(expected):
            raise ValueError('ZIP 文件集合与 Git 上游清单不同')
        for relative, entry in contents.items():
            raw = archive.read(entry)
            digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if digest != expected[relative]['sha']:
                raise ValueError(f'ZIP 内容与上游 blob 不符：{relative}')
        if extract:
            if target.exists() and any(target.iterdir()):
                raise ValueError('网页目录不是空目录，拒绝覆盖；核对已有文件请去掉 --extract')
            target.mkdir(parents=True, exist_ok=True)
            for relative, entry in contents.items():
                output = target.joinpath(*PurePosixPath(relative).parts)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.read(entry))
    return expected, tree['sha']


def inspect_files(expected):
    target = LIBRARY / '网页'
    actual = {path.relative_to(target).as_posix(): path for path in target.rglob('*') if path.is_file()}
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    if missing or extra:
        raise ValueError(f'本地副本文件集合不符：缺少 {len(missing)}，多出 {len(extra)}')
    paths = {path.casefold(): path for path in actual}
    pages, broken, external, encodings, hashes = [], [], [], Counter(), []
    toc = []
    for relative, path in sorted(actual.items()):
        raw = path.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if blob != expected[relative]['sha']:
            raise ValueError(f'本地文件被改动：{relative}')
        hashes.append({'path': relative, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        if path.suffix.lower() not in ('.htm', '.html', '.css'):
            continue
        text, encoding = decode(raw)
        encodings[encoding] += 1
        parser = Page()
        if path.suffix.lower() == '.css':
            parser.refs = [('css', 'url', ref.strip(' \"\'')) for ref in re.findall(r'url\((.*?)\)', text)]
        else:
            parser.feed(text)
            pages.append({'path': relative, 'title': ''.join(parser.title_parts).strip() or path.stem, 'bytes': len(raw)})
        if relative == 'webhelpcontents.htm':
            toc = parser.links
        for tag, attribute, ref in parser.refs:
            try:
                destination, kind = local_target(relative, ref)
            except ValueError:
                broken.append({'page': relative, 'attribute': attribute, 'ref': ref, 'target': '无法解析'})
                continue
            if kind == 'external':
                external.append({'page': relative, 'tag': tag, 'attribute': attribute, 'ref': ref})
            elif kind == 'local' and destination.casefold() not in paths:
                broken.append({'page': relative, 'attribute': attribute, 'ref': ref, 'target': destination})
    return pages, toc, broken, external, encodings, hashes, sum(path.stat().st_size for path in actual.values())


def make_portal(pages, toc, summary):
    samples = []
    patterns = [('版本说明', r'写在前面'), ('玩家手册', r'^玩家手册'), ('城主指南', r'^城主指南'),
                ('怪物图鉴', r'^怪物图鉴'), ('职业', r'^战士$'), ('战斗', r'^战斗流程$'),
                ('法术', r'^火球术'), ('旧版分区', r'旧版.*(手册|指南|规则)|玩家手册.*旧版'),
                ('合作内容', r'塔尔多雷')]
    for label, pattern in patterns:
        for ref, title in toc:
            if re.search(pattern, title):
                destination, kind = local_target('webhelpcontents.htm', ref)
                if kind == 'local' and any(page['path'].casefold() == destination.casefold() for page in pages):
                    samples.append((label, title, destination))
                    break
    for label, title, path in [
        ('法术与表格', '玩家手册2024：3环法术（用 Ctrl+F 找火球术）', 'topics/玩家手册2024/法术详述/3环.htm'),
        ('新版怪物', '怪物图鉴2025：地精武者', 'topics/怪物图鉴2025/妖精/地精/地精武者.htm'),
    ]:
        if any(page['path'] == path for page in pages):
            samples.append((label, title, path))
    cards = ''.join(f'<a class="sample" target="_blank" rel="noopener" href="网页/{quote(path, safe="/")}"><small>{html.escape(label)}</small>{html.escape(title)}</a>' for label, title, path in samples)
    data = json.dumps(pages, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    document = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>5E 不全书 · 本地查阅与快速检测</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#26352f;font:16px/1.7 "Microsoft YaHei",sans-serif}main{max-width:1120px;margin:auto;padding:36px 24px}h1{font-size:30px;margin:0 0 12px}h2{font-size:21px;margin-top:30px}p{max-width:920px}a{color:#17614b}nav{display:flex;gap:20px;flex-wrap:wrap}.stats,.samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0}.stat,.sample{background:white;padding:16px;border:1px solid #dce1d9;border-radius:10px}.stat strong{display:block;font-size:26px}small{display:block;color:#647269}.sample{text-decoration:none}.sample:hover{border-color:#17614b}.notice{padding:14px 18px;background:#fff4db;border-left:4px solid #b18324}input[type=search]{width:100%;padding:14px;font:inherit;border:1px solid #9dae9d;border-radius:8px}li{margin:8px 0}.path{font:12px/1.4 monospace;overflow-wrap:anywhere;color:#6e776d}.checklist label{display:block;margin:12px 0}#results{padding-left:24px}footer{margin-top:36px;border-top:1px solid #ccd5c9;padding-top:16px;color:#647269;font-size:14px}
</style><main><h1>5E 不全书 · 本地查阅</h1><p>完整收录本次固定快照，保留新版、旧版与扩展。查阅某条规则时，仍须核对所属书籍及年份。</p>
<nav><a href="网页/indexh.htm" target="_blank">原始简易目录</a><a href="原始发布/DND.26.09.13.chm">原始 CHM</a><a href="检查摘要.json" target="_blank">机器检查摘要</a><a href="来源.json" target="_blank">版本与来源</a></nav>
<div class="stats"><div class="stat"><strong>__FILES__</strong>上游文件全部匹配</div><div class="stat"><strong>__PAGES__</strong>HTML 页面</div><div class="stat"><strong>__BROKEN__</strong>上游本地引用缺口</div></div>
<p class="notice">这是离线查阅入口，不是 D&D 规则程序。原站搜索可能使用网络服务；下面的标题搜索直接在本页运行，无需网络。全文检索尚未接入。缺口数量统计引用次数，并不等于缺失正文数量。</p>
<h2>五分钟人工抽查</h2><div class="checklist"><label><input type="checkbox"> 先断开网络，打开本页；以下抽查均在新标签中打开。</label><label><input type="checkbox"> 查看“写在前面”的版本，再确认核心三本书的年份标识。</label><label><input type="checkbox"> 打开一个职业、一个法术和一个怪物页面，检查中文、表格及图片。</label><label><input type="checkbox"> 从原始目录进入同一页面，确认目录跳转正常。</label><label><input type="checkbox"> 打开旧版和合作内容，确认没有与 2024 核心来源混为一谈。</label><label><input type="checkbox"> 用下方标题搜索查找一条自己熟悉的规则；正文内用 Ctrl+F 查词，并与线上同页核对。</label></div>
<div class="samples">__CARDS__</div><h2>本地标题与路径搜索</h2><p>部分法术按环阶合并在一页，先找“3环”等页面，再用 Ctrl+F 找具体法术。</p><input id="query" type="search" placeholder="例如：战士、地精、3环、旧版" aria-label="搜索本地页面标题和路径"><p id="count"></p><ol id="results"></ol>
<footer>网页快照 c1425c8；CHM v2026.09.13。机器检查证明文件与固定上游版本一致，不证明译文、规则或上游链接全部正确。勾选框只用于本次人工核对，刷新后不保留。</footer></main>
<script>const pages=__DATA__;const query=document.getElementById('query'),results=document.getElementById('results'),count=document.getElementById('count');function render(){const words=query.value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);if(!words.length){count.textContent=`可搜索 ${pages.length} 个页面；输入关键词开始。`;results.replaceChildren();return;}const matched=words.length?pages.filter(p=>words.every(w=>(p.title+' '+p.path).toLocaleLowerCase().includes(w))):pages;count.textContent=`共 ${matched.length} 项，显示前 ${Math.min(100,matched.length)} 项。`;results.replaceChildren();for(const p of matched.slice(0,100)){const li=document.createElement('li'),a=document.createElement('a'),detail=document.createElement('div');a.textContent=p.title;a.href='网页/'+p.path.split('/').map(encodeURIComponent).join('/');a.target='_blank';a.rel='noopener';detail.className='path';detail.textContent=p.path;li.append(a,detail);results.append(li);}}query.addEventListener('input',render);render();</script></html>'''
    document = document.replace('__FILES__', str(summary['files'])).replace('__PAGES__', str(summary['html_pages'])).replace('__BROKEN__', str(summary['broken_local_references'])).replace('__CARDS__', cards).replace('__DATA__', data)
    (LIBRARY / '打开不全书.html').write_text(document, encoding='utf-8')
    return [{'label': label, 'title': title, 'path': path} for label, title, path in samples]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extract', action='store_true', help='从已校验 ZIP 提取到空目录')
    args = parser.parse_args()
    config = json.loads((LIBRARY / '来源.json').read_text(encoding='utf-8-sig'))
    expected, tree_sha = verify_archive(config, args.extract)
    pages, toc, broken, external, encodings, hashes, size = inspect_files(expected)
    active_external = [item for item in external if item['attribute'] != 'href' or item['tag'] == 'link']
    broken_types = Counter('正文/目录链接' if Path(item['target']).suffix.lower() in ('.htm', '.html') else
                           'Word 编辑元数据' if Path(item['target']).suffix.lower() in ('.xml', '.mso', '.thmx') else
                           '图片或其他资源' for item in broken)
    summary = {'checked_date': datetime.now(timezone(timedelta(hours=8))).date().isoformat(), 'revision': config['web']['revision'], 'tree_sha': tree_sha,
               'archives_sha256_verified': True, 'zip_crc_verified': True, 'git_blob_matches': len(expected),
               'files': len(expected), 'bytes': size, 'html_pages': len(pages), 'encodings': dict(encodings),
               'broken_local_references': len(broken), 'distinct_missing_targets': len({item['target'] for item in broken}),
               'broken_reference_types': dict(broken_types),
               'external_references': len(external), 'external_resource_references': len(active_external),
               'limits': ['仅核对静态 HTML 属性及 CSS url，未执行上游脚本或检查所有锚点。',
                          '远程链接、脚本动态请求、云端搜索索引和未收录内容不在网页快照内。',
                          '所有检查均与固定上游版本比较，不证明上游译文或规则正确。']}
    summary['manual_samples'] = make_portal(pages, toc, summary)
    write_json(LIBRARY / '检查摘要.json', summary)
    write_json(LIBRARY / '校验明细.json', {'files': hashes, 'broken_references': broken, 'external_references': external})
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
