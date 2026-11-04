"""Preview a completed character in the three-page fillable character sheet."""

import io
import json
import re
import sys
from pathlib import Path

import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject,
    FloatObject, NameObject, NumberObject, TextStringObject,
)


ABILITY = dict(zip(("力量", "敏捷", "体质", "智力", "感知", "魅力"),
                   ("STR", "DEX", "CON", "INT", "WIS", "CHA")))
MODS = ("STRmod", "DEXmod ", "CONmod", "INTmod", "WISmod", "CHamod")
SAVES = ("Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma")
SKILLS = {
    "运动": ("Athletics", "Athletics"), "体操": ("Acrobatics", "Acrobatics"),
    "巧手": ("SleightofHand", "Sleight"), "隐匿": ("Stealth", "Stealth"),
    "奥秘": ("Arcana", "Arcana"), "历史": ("History", "History"),
    "调查": ("Investigation", "Investigation"), "自然": ("Nature", "Nature"),
    "宗教": ("Religion", "Religion"), "驯兽": ("Animal Handling", "Animal"),
    "洞悉": ("Insight", "Insight"), "医药": ("Medicine", "Medi"),
    "察觉": ("Perception", "Perception"), "求生": ("Survival", "Survival"),
    "欺瞒": ("Deception", "Deception"), "威吓": ("Intimidation", "Intimidation"),
    "表演": ("Performance", "Performance"), "游说": ("Persuasion", "Persuasion"),
}
PANELS = {
    "资源与恢复": (32, 326, 289, 665),
    "专注与动作索引": (303, 326, 580, 665),
    "开卡设置": (32, 155, 289, 307),
    "法术书与施法来源": (303, 155, 580, 307),
}
INK = (0.08, 0.14, 0.17)


def rect(obj):
    return tuple(map(float, obj["/Rect"]))


def numbers(items):
    return "、".join(map(str, items)) or "无"


def signed(value):
    return f"{value:+d}"


def wrapped(text, width, size, font):
    result = []
    for paragraph in text.split("\n"):
        line = ""
        for token in re.findall(r"[A-Za-z0-9+./-]+|.", paragraph):
            pieces = [token] if font.text_length(token, size) <= width else list(token)
            for part in pieces:
                if line and font.text_length(line + part, size) > width:
                    if part in "，。；：、！？）》】" and len(line) > 1:
                        result.append(line[:-1])
                        line = line[-1:] + part
                    else:
                        result.append(line.rstrip())
                        line = part.lstrip()
                else:
                    line += part
        result.append(line)
    return result


def concise_effect(effect, limit=104):
    text = re.sub(r"\s+", " ", effect).strip()
    if len(text) <= limit:
        return text
    end = max(text.rfind(mark, 0, limit) for mark in "。！？")
    return text[:end + 1] if end >= limit // 2 else text[:limit] + "…"


def card_values(saved):
    s, answers = saved["snapshot"], saved["answers"]
    spells = saved["spells"]
    casting, gear = s["spellcasting"], s["equipment"]
    origin = s["species"] + ("／" + s["lineage"] if s["lineage"] else "")
    role = f'{s["className"]}{s["level"]}级' + (" · " + s["subclass"] if s["subclass"] else "")
    values = {
        "CharacterName": s["name"], "CharacterName 2": s["name"] + " · " + role + " · 2024规则",
        "ClassLevel": role, "Background": s["background"], "Race ": origin,
        "ProfBonus": signed(s["proficiency"]), "AC": str(s["ac"]),
        "Initiative": signed(s["initiative"]), "Speed": f'{s["speed"]}尺',
        "HPMax": str(s["hpMax"]), "HDTotal": str(s["level"]), "HD": s["hitDice"],
        "Passive": str(s["passivePerception"]),
    }
    new_card = not s.get("upgradedFrom") and not s.get("currentState")
    if new_card:
        values.update(HPCurrent=str(s["hpMax"]), HPTemp="0")
    checks = set()
    for i, (label, key) in enumerate(ABILITY.items()):
        values[key] = str(s["scores"][label])
        values[MODS[i]] = signed(s["modifiers"][label])
        values["SavingThrows" + (str(i + 1) if i else "")] = signed(s["savingThrows"][label])
        if label in s["savingProficiencies"]:
            checks.add("ST " + SAVES[i])
    for label, (field, checkbox) in SKILLS.items():
        values[field] = signed(s["skills"][label])
        if label in s["proficiencies"]:
            checks.add("ChBx " + checkbox)
    attacks = gear["attacks"]
    columns = (("Wpn Name", "Wpn1 AtkBonus", "Wpn1 Damage"),
               ("Wpn Name 2", "Wpn2 AtkBonus ", "Wpn2 Damage "),
               ("Wpn Name 3", "Wpn3 AtkBonus  ", "Wpn3 Damage "))
    for attack, fields in zip(attacks, columns):
        damage = re.sub(r"^(\S+)", lambda m: m[1] + signed(attack["damageBonus"]), attack["damage"] or "")
        values.update(zip(fields, (attack["name"], signed(attack["attack"]), damage)))
    casting_text = (f'职业施法：{casting["ability"]}，法攻{signed(casting["attack"])}，DC{casting["dc"]}。'
                    if casting else "本级没有职业施法数值。")
    values["AttacksSpellcasting"] = "\n".join([
        casting_text, "", "【常用武器】",
        *[f'{a["name"]}：命中{signed(a["attack"])}。{a["properties"] or "无额外词条"}。' + (f'精通：{a["mastery"]}。' if a["mastery"] else "")
          for a in attacks], "资源、动作和法术速查见第二页。"
    ])
    feats = "、".join(f['name'] + f'（{f["source"]}）' for f in s["feats"]) or "无"
    values["Features and Traits"] = "\n\n".join([
        f"【种族与背景】\n{origin}，{s['size']}。背景：{s['background']}。",
        "【专长】\n" + feats,
        f"【法术】\n职业戏法{len(s['cantrips'])}道，职业准备{len(s['prepared'])}道，其他来源见第二、三页。",
        f"【角色状态】\n护甲：{gear['armor']}。盾牌：" + ("使用。" if gear["shield"] else "未使用。"),
    ])
    values["ProficienciesLang"] = "\n".join([
        "豁免熟练：" + numbers(s["savingProficiencies"]),
        "武器熟练：" + (s["weaponTraining"] or "无"),
        "护甲受训：" + numbers(x for x in s["armorTraining"] if x != "盾牌"),
        "盾牌受训：" + ("有" if "盾牌" in s["armorTraining"] else "无"),
        "工具：" + numbers(s["tools"]), "语言：" + numbers(s["languages"]),
    ])
    values["Equipment"] = "\n".join([
        *(entry["source"] + "：" + entry["contents"] for entry in gear["starting"]),
        "购买：" + numbers(f'{item["name"]}×{item["count"]}' for item in gear["purchases"]),
        f'余额：{gear["gold"]} GP。', *gear["notes"],
    ])
    resources = resource_lines(s, new_card)
    config = saved.get("config", {})
    setup = [f'{role} · {origin} · {s["background"]}',
             "基础属性方式：" + answers.get("属性方式", "未记录"),
             "背景加值：" + answers.get("背景加值", "未记录")]
    if config.get("pointBuy32"):
        setup.append("32点购点。基础属性16花12点。")
    if config.get("freeBackgroundAbilities"):
        setup.append("背景加值自由分配3点。单项最多加2点。")
    index = [casting_text]
    for label, predicate in [
        ("专注", lambda tags: "专注" in tags.get("持续时间", "")),
        ("附赠动作", lambda tags: "附赠动作" in tags.get("施法时间", "")),
        ("反应", lambda tags: "反应" in tags.get("施法时间", "")),
        ("仪式", lambda tags: "仪式" in tags.get("施法时间", "")),
    ]:
        index.append(label + "：" + numbers(spell["name"] for spell in spells if predicate(spell["tags"])))
    index.append("能力与法术效果见文末表格。")
    book = ["法术书：" + numbers(s["spellbook"])] if s["spellbook"] else []
    extras = {}
    for grant in s["grantedSpells"]:
        key = (grant["source"], grant.get("ability"), grant.get("dc"))
        extras.setdefault(key, []).append(grant["name"])
    for (source, ability, dc), names in extras.items():
        detail = (f" · {ability}" if ability else "") + (f" · DC {dc}" if dc is not None else "")
        book.append(source + detail + "：" + numbers(names))
    sections = dict(zip(PANELS, (resources, index, setup, book or ["本级没有额外施法来源。"])))
    values.update({name: "\n".join(lines) for name, lines in sections.items()})
    if casting or spells:
        values["Spellcasting Class 2"] = role
    if casting:
        values.update({
            "SpellcastingAbility 2": casting["ability"] + signed(s["modifiers"][casting["ability"]]),
            "SpellSaveDC  2": str(casting["dc"]), "SpellAtkBonus 2": signed(casting["attack"]),
        })
        for rank, count in enumerate(casting["slots"], 1):
            if count:
                values[f"SlotsTotal {rank + 18}"] = str(count)
                if new_card:
                    values[f"SlotsRemaining {rank + 18}"] = "0"
    return values, checks


def resource_lines(snapshot, fresh):
    def fraction(maximum):
        return f"{maximum if fresh else '___'}/{maximum}"

    dice = re.fullmatch(r"(\d+)d(\d+)", snapshot["hitDice"])
    lines = ["【当前 / 上限】", "生命值：" + fraction(snapshot["hpMax"])]
    if dice:
        count, sides = map(int, dice.groups())
        con = snapshot["modifiers"]["体质"]
        low, high = max(1, 1 + con), max(1, sides + con)
        span = f"{low}至{high}" if low != high else str(low)
        lines.extend([
            f"生命骰：{fraction(count)}（d{sides}）", "",
            f"短休：每花1枚生命骰，恢复1d{sides}{signed(con)} HP（{span} HP，最低1）。",
        ])
    casting = snapshot.get("spellcasting")
    if casting:
        slots = [f"{rank}环 {fraction(maximum)}" for rank, maximum in enumerate(casting["slots"], 1) if maximum]
        if slots:
            lines.extend(["", "【法术位】", numbers(slots)])
    pools = snapshot.get("resourcePools", {})
    if pools:
        lines.extend(["", "【其他已记录资源】"])
        for label, item in pools.items():
            lines.extend([f'{label}：{fraction(item["max"])}', item["recovery"]])
    if not fresh:
        lines.extend(["", "空白处填写实际当前值。"])
    return lines


def mage_armor_ac(snapshot):
    if snapshot["equipment"]["armor"] != "无":
        return None
    shield = snapshot["equipment"]["shield"] and "盾牌" in snapshot["armorTraining"]
    return 13 + snapshot["modifiers"]["敏捷"] + (2 if shield else 0)


def spell_state(spell, snapshot, spell_names):
    name = spell["name"]
    if name == "法师护甲":
        after = mage_armor_ac(snapshot)
        if after is None:
            return "目标需未穿甲。\n当前穿甲，无法套用。"
        before = snapshot["ac"]
        if after <= before:
            return f"法术提供 AC {after}\n当前 AC {before} 可保留。"
        return f"AC {signed(after-before)}\n{before} → {after}\n对自己施放，未穿甲"
    if name == "护盾术":
        before = snapshot["ac"]
        state = f"AC +5\n常态 {before} → {before+5}"
        after_armor = mage_armor_ac(snapshot) if "法师护甲" in spell_names else None
        if after_armor is not None and after_armor > before:
            state += f"\n已有法师护甲时\n{after_armor} → {after_armor+5}"
        return state
    return {
        "交友术": "目标：魅惑\n感知豁免失败时",
        "睡眠术": "目标：失能 → 昏迷\n两次感知豁免均失败时",
        "神导术": "所选技能检定 +1d4\n总值取决于骰点",
        "光亮术": "光照：20尺明亮光\n再外20尺微光",
    }.get(name, "")


def reference_groups(saved):
    snapshot, answers = saved["snapshot"], saved["answers"]
    groups = {}
    for feature in saved.get("classFeatures", []):
        state = ""
        if feature["name"] == "奥术回想":
            pool = snapshot.get("resourcePools", {}).get("奥术回想可恢复环阶")
            if pool:
                state = f'恢复已消耗的法术位\n环阶合计最多 {pool["max"]}\n仅限 1 至 5 环'
        groups.setdefault(feature["category"], []).append((
            feature["name"], concise_effect(feature["text"], 160), state
        ))
    for feat in saved.get("featFeatures", []):
        groups.setdefault("专长", []).append((
            feat["name"], f'{feat["source"]}。' + concise_effect(feat["text"], 138), ""
        ))
    for name in ("原初职能", "神圣职能", "战斗风格", "元素之怒", "受祝击",
                 "超魔法", "魔能祈唤", "野兽形态", "武器精通"):
        if value := answers.get(name):
            groups.setdefault("已选特性", []).append((name, concise_effect(value, 160), ""))
    spell_names = {spell["name"] for spell in saved["spells"]}
    for spell in saved["spells"]:
        tags = spell["tags"]
        brief = "／".join(tags[key] for key in ("施法时间", "施法距离", "法术成分", "持续时间") if tags.get(key))
        rank = spell["rank"]
        category = f"{rank}环法术" if rank else "戏法"
        details = "\n".join(filter(None, [brief, concise_effect(spell["effect"], 160)]))
        groups.setdefault(category, []).append((
            spell["name"] + "\n" + "／".join(spell["source"]), details, spell_state(spell, snapshot, spell_names)
        ))
    return groups


def draw_reference_pages(art, font, saved):
    x = (34, 158, 428, 578)
    dark, border, muted = (0.12, 0.20, 0.25), (0.76, 0.80, 0.82), (0.33, 0.39, 0.42)
    pages = []

    def put(page, left, baseline, text, size, color=INK):
        page.insert_text((left, baseline), text, fontname="CardFont", fontsize=size, color=color)

    def new_page():
        page = art.new_page(width=612, height=792)
        page.insert_font(fontname="CardFont", fontbuffer=font.buffer)
        pages.append(page.number)
        put(page, x[0], 47, "能力速查", 23)
        put(page, x[0], 68, f'{saved["snapshot"]["name"]} · {saved["snapshot"]["level"]}级 · 2024规则', 10, muted)
        put(page, x[0], 85, "按类别查找。右栏写明可核对的变化，多个效果能否叠加按各自条件判定。", 8.5, muted)
        page.draw_rect(fitz.Rect(x[0], 98, x[3], 121), color=None, fill=dark)
        for i, label in enumerate(("能力 / 来源", "使用方式与效果", "可能改变的状态")):
            put(page, x[i]+8, 113, label, 9.5, (1, 1, 1))
        put(page, x[0], 761, "规则节录。遇到特殊条件，以对应完整条文为准。", 8, muted)
        put(page, x[3]-73, 761, f"速查 第 {len(pages)} 页", 8, muted)
        return page

    def category_bar(page, y, label):
        page.draw_rect(fitz.Rect(x[0], y, x[3], y+21), color=border, fill=(0.91, 0.94, 0.95), width=.55)
        put(page, x[0]+8, y+14.5, label, 10)
        return y+21

    page, y = None, 0
    for category, entries in reference_groups(saved).items():
        for index, row in enumerate(entries):
            sizes = (9.6, 9.2, 9.6)
            columns = [wrapped(text or "—", x[i+1]-x[i]-16, sizes[i], font) for i, text in enumerate(row)]
            height = max(35, 15 + max(map(len, columns))*13)
            new = page is None or y + height + (21 if index == 0 else 0) > 739
            if new:
                page, y = new_page(), 121
            if new or index == 0:
                y = category_bar(page, y, category + ("（续）" if index else ""))
            for i, lines in enumerate(columns):
                fill = (0.95, 0.98, 0.96) if i == 2 and row[2] else (1, 1, 1)
                page.draw_rect(fitz.Rect(x[i], y, x[i+1], y+height), color=border, fill=fill, width=.55)
                for line, text in enumerate(lines):
                    put(page, x[i]+8, y+15+line*13, text, sizes[i])
            y += height
    return pages


def widgets(page):
    return [ref.get_object() for ref in page.get("/Annots", [])
            if ref.get_object().get("/Subtype") == "/Widget"]


def spell_fields(page, spells):
    all_widgets = widgets(page)
    fields = {str(w["/T"]): w for w in all_widgets}
    spells_at = [w for w in all_widgets if str(w["/T"]).startswith("Spells ")]
    boxes = [w for w in all_widgets if w.get("/FT") == "/Btn"]
    center_y = lambda w: (rect(w)[1] + rect(w)[3]) / 2
    ranks = ((0, 1, 2), (3, 4, 5), (6, 7, 8, 9))
    values, checks, overflow = {}, set(), []
    for col, column_ranks in enumerate(ranks):
        column = [w for w in spells_at if int((rect(w)[0] - 25) / 187) == col]
        top = 792
        for i, rank in enumerate(column_ranks):
            if rank:
                top = rect(fields[f"SlotsTotal {rank + 18}"])[1]
            bottom = rect(fields[f"SlotsTotal {column_ranks[i + 1] + 18}"])[3] if i + 1 < len(column_ranks) else 0
            rows = sorted((w for w in column if bottom < center_y(w) < top), key=center_y, reverse=True)
            entries = [sp for sp in spells if sp["rank"] == rank]
            for w, spell in zip(rows, entries):
                source = spell["source"]
                label = "／".join(dict.fromkeys(s.split("／")[0].replace("职业准备", "准备").replace("背景专长", "背景") for s in source))
                values[str(w["/T"])] = spell["name"] + "（" + label + "）"
                if rank:
                    candidates = [b for b in boxes if 0 < rect(w)[0] - rect(b)[0] < 14 and abs(center_y(b) - center_y(w)) < 5]
                    if candidates:
                        checks.add(str(min(candidates, key=lambda b: abs(center_y(b)-center_y(w)))["/T"]))
            overflow.extend(f'{rank}环 · {sp["name"]}（{" / ".join(sp["source"])}）' for sp in entries[len(rows):])
    return values, checks, overflow


def add_panels(writer):
    page = writer.pages[1]
    remove = {"CHARACTER IMAGE", "Allies", "FactionName", "Faction Symbol Image", "Backstory", "Feat+Traits", "Treasure"}
    keep = lambda ref: str(ref.get_object().get("/T")) not in remove
    page[NameObject("/Annots")] = ArrayObject(filter(keep, page.get("/Annots", [])))
    form = writer.root_object["/AcroForm"]
    form[NameObject("/Fields")] = ArrayObject(filter(keep, form["/Fields"]))
    for name, (x0, y0, x1, y1) in PANELS.items():
        obj = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"), NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject(FloatObject(v) for v in (x0+7, y0+10, x1-7, y1-8)),
            NameObject("/P"): page.indirect_reference, NameObject("/F"): NumberObject(4),
        })
        ref = writer._add_object(obj)
        form["/Fields"].append(ref)
        page["/Annots"].append(ref)


def draw_panels(page, font):
    page.draw_rect(fitz.Rect(0, 111, 612, 769), color=None, fill=(1, 1, 1))
    for name, (x0, y0, x1, y1) in PANELS.items():
        y = 792 - y0
        box = fitz.Rect(x0, 792 - y1, x1, y)
        page.draw_rect(box, color=INK, width=.8, radius=.016)
        width = font.text_length(name, 8.5)
        left = (x0+x1-width) / 2
        page.draw_rect(fitz.Rect(left-6, y-4, left+width+6, y+5), color=None, fill=(1, 1, 1))
        page.insert_text((left, y+2.7), name, fontname="CardFont", fontsize=8.5, color=INK)


def button_appearance(writer, commands=b""):
    appearance = DecodedStreamObject()
    appearance.set_data(commands)
    appearance.update({
        NameObject("/Type"): NameObject("/XObject"),
        NameObject("/Subtype"): NameObject("/Form"),
        NameObject("/BBox"): ArrayObject(NumberObject(n) for n in (0, 0, 1, 1)),
    })
    return writer._add_object(appearance)


def preview(template, output, saved):
    if output.suffix.lower() != ".pdf" or output.exists():
        raise ValueError("请选择尚不存在的PDF输出路径。")
    reader = PdfReader(template)
    if len(reader.pages) != 3 or not reader.get_fields():
        raise ValueError("请选择跑团记录使用的三页可填写空白角色卡。")
    canonical_ids = {str(ref.get_object().get("/T")): ref.idnum
                     for ref in reader.root_object["/AcroForm"]["/Fields"]}
    for page in reader.pages:
        for widget in widgets(page):
            name = str(widget.get("/T"))
            if name in canonical_ids and widget.indirect_reference.idnum != canonical_ids[name]:
                raise ValueError("底表字段与页面表单冲突：" + name)
    writer = PdfWriter(clone_from=reader)
    writer.reattach_fields()
    add_panels(writer)
    values, checked = card_values(saved)
    spell_values, spell_checks, extra_spells = spell_fields(writer.pages[2], saved["spells"])
    values.update(spell_values)
    checked.update(spell_checks)
    font = fitz.Font("cjk")
    art = fitz.open()
    panel_page = art.new_page(width=612, height=792)
    panel_page.insert_font(fontname="CardFont", fontbuffer=font.buffer)
    draw_panels(panel_page, font)
    all_widgets = {str(w["/T"]): w for page in writer.pages for w in widgets(page)}
    if missing := (values.keys() | checked) - all_widgets.keys():
        raise ValueError("空白角色卡缺少字段：" + "、".join(sorted(missing)))
    for name, area in {"Inspiration": (48.49, 606.71, 77.48, 623.27),
                       "ProfBonus": (48.49, 634.72, 77.80, 651.28)}.items():
        all_widgets[name][NameObject("/Rect")] = ArrayObject(FloatObject(v) for v in area)

    appearances, appendix = {}, []
    for name, value in values.items():
        obj = all_widgets[name]
        x0, y0, x1, y1 = rect(obj)
        w, h = x1-x0, y1-y0
        center = name not in PANELS and h < 35 and name not in {"CharacterName", "CharacterName 2", "ClassLevel", "Background", "Race ", "Spellcasting Class 2"} and not name.startswith(("Wpn", "Spells "))
        size = 18 if name == "HPCurrent" else 11 if name == "CharacterName" else 8.5 if h > 35 else 8
        pad = 3 if h > 35 else .65
        line_width = w - 2 * pad
        lines = wrapped(value, line_width, size, font)
        while (len(lines) > 1 if h < 35 else len(lines)*size*1.28 > h-pad-5) and size > 7:
            size -= .25
            lines = wrapped(value, line_width, size, font)
        if (len(lines) > 1 if h < 35 else len(lines)*size*1.28 > h-pad-5):
            appendix.extend([name, value, ""])
            value = "详见补充页"
            lines = [value]
            values[name] = value
        page = art.new_page(width=w, height=h)
        page.insert_font(fontname="CardFont", fontbuffer=font.buffer)
        y = (h + size * .64) / 2 if len(lines) == 1 and h < 35 or name == "HPCurrent" else pad + size
        for line in lines:
            x = (w - font.text_length(line, size)) / 2 if center or name == "HPCurrent" else (3 if h > 35 else .65)
            page.insert_text((x, y), line, fontname="CardFont", fontsize=size, color=INK)
            y += size * 1.28
        appearances[name] = (page.number, size)
    if extra_spells:
        appendix.extend(["法术列表续", *extra_spells])
    extra_pages = []
    if appendix:
        lines = wrapped("\n".join(appendix), 530, 10, font)
        for start in range(0, len(lines), 43):
            page = art.new_page(width=612, height=792)
            extra_pages.append(page.number)
            page.insert_font(fontname="CardFont", fontbuffer=font.buffer)
            page.insert_text((40, 48), saved["snapshot"]["name"] + " · 角色卡补充", fontname="CardFont", fontsize=15, color=INK)
            for index, line in enumerate(lines[start:start+43]):
                page.insert_text((40, 80+index*15), line, fontname="CardFont", fontsize=10, color=INK)
    extra_pages.extend(draw_reference_pages(art, font, saved))
    art.subset_fonts()
    drawing = PdfReader(io.BytesIO(art.tobytes(garbage=4, deflate=True)))
    writer.pages[1].merge_page(drawing.pages[0])
    for index in extra_pages:
        writer.add_page(drawing.pages[index])
    form = writer.root_object["/AcroForm"]
    form[NameObject("/NeedAppearances")] = BooleanObject(False)
    dr = form.get("/DR", DictionaryObject()).get_object()
    fonts = dr.get("/Font", DictionaryObject()).get_object()
    fonts[NameObject("/CardFont")] = drawing.pages[0]["/Resources"]["/Font"].raw_get("/CardFont").clone(writer)
    dr[NameObject("/Font")] = fonts
    form[NameObject("/DR")] = dr
    for name, (index, size) in appearances.items():
        obj, page = all_widgets[name], drawing.pages[index]
        ap = DecodedStreamObject()
        ap.set_data(page.get_contents().get_data())
        ap.update({
            NameObject("/Type"): NameObject("/XObject"), NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): page.mediabox.clone(writer),
            NameObject("/Resources"): page["/Resources"].clone(writer),
        })
        obj[NameObject("/V")] = TextStringObject(values[name])
        obj[NameObject("/DA")] = TextStringObject(f"/CardFont {size:g} Tf 0.08 0.14 0.17 rg")
        obj[NameObject("/Ff")] = NumberObject(4096 if "\n" in values[name] else 0)
        obj[NameObject("/AP")] = DictionaryObject({NameObject("/N"): writer._add_object(ap)})
    blank = button_appearance(writer)
    dot = button_appearance(writer, b"0.08 0.14 0.17 rg .75 .5 m .75 .638 .638 .75 .5 .75 c .362 .75 .25 .638 .25 .5 c .25 .362 .362 .25 .5 .25 c .638 .25 .75 .362 .75 .5 c f\n")
    for name, obj in all_widgets.items():
        if obj.get("/FT") == "/Btn":
            state = NameObject("/Yes" if name in checked else "/Off")
            obj[NameObject("/V")] = obj[NameObject("/AS")] = state
            obj[NameObject("/AP")] = DictionaryObject({
                NameObject("/N"): DictionaryObject({NameObject("/Yes"): dot, NameObject("/Off"): blank})
            })
        elif obj.get("/FT") == "/Tx" and name not in appearances:
            obj[NameObject("/V")] = TextStringObject("")
            obj[NameObject("/DA")] = TextStringObject("/CardFont 8 Tf 0.08 0.14 0.17 rg")
            obj[NameObject("/AP")] = DictionaryObject({NameObject("/N"): blank})
    writer.add_metadata({"/Title": saved["snapshot"]["name"] + " · 角色卡预览", "/Creator": "本地开卡与升级"})
    buff = io.BytesIO()
    writer.write(buff)
    result = PdfReader(buff)
    canonical = result.get_fields()
    final_widgets = {str(w["/T"]): w for page in result.pages for w in widgets(page)}
    for name, value in values.items():
        assert canonical[name]["/V"] == value == final_widgets[name]["/V"], name
        assert final_widgets[name]["/AP"]["/N"].get_data(), name
    for name in checked:
        assert canonical[name]["/V"] == final_widgets[name]["/AS"] != "/Off", name
    with output.open("xb") as file:
        file.write(buff.getbuffer())
    print(output.resolve())


if __name__ == "__main__":
    preview(Path(sys.argv[1]), Path(sys.argv[2]), json.load(sys.stdin))
