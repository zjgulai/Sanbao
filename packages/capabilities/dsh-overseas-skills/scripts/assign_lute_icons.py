#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分配 LUTE 头像到出海技能：分类 25 枚 + 81 系技能 81 枚。
数据源：lute-brand-icons 技能资产 manifest.json（id → data URI）。
产出：manifest/category-icons.json（分类头像）+ manifest/skill-icons.json（技能头像）。
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LUTE = os.path.expanduser("~/.dsh/skills/lute-brand-icons/assets/manifest.json")

# 分类 → LUTE 头像 id（复用现成角色，品牌为新增 brand-officer）
CAT_ASSIGN = {
    "a-market": "sc-a-market",
    "b-product": "sc-b-product",
    "c-content-brand": "sc-c-content-brand",
    "d-traffic": "sc-d-traffic",
    "e-sales": "sc-e-sales",
    "f-fulfillment": "sc-f-fulfillment",
    "g-insight": "sc-g-insight",
    "h-enable": "sc-h-enable",

    "sourcing": "procurement",
    "research-selection": "search",
    "design": "ux-designer",
    "content-gtm": "content-ops",
    "brand": "brand-officer",
    "pr": "sales-director",
    "social-ops": "live-host",
    "seo-ads": "launch",
    "store-ops": "store-manager",
    "shipping-tariff": "supply-chain",
    "analytics-finance": "finance-analyst",
    "crm-retention": "praise",
    "productivity": "document",
    "agent-tools": "fullstack-dev",
    "other": "inspiration",
    "knowledge-engineering": "mom-teacher",
    "skill-engineering": "settings",
    "ecommerce-analytics": "data-scientist",
    "preset-ai-content-image-studio": "camera",
    "preset-ai-product-developer": "product-manager",
    "preset-ai-report-analyst": "research-analyst",
    "preset-dsh-motion-deck-studio": "motion-designer",
    "preset-feishu-digital-employee": "admin-feishu",
    "preset-llm-wiki-fullstack": "knowledge-architect",
    "preset-product-video-director": "video-editor",
}

# 81 技能 → sk-<name>（生成器已按此 id 产出）
mapping = json.load(open(os.path.join(ROOT, "scripts", "81-mapping.json"), encoding="utf-8"))
SKILL_ASSIGN = {s["name"]: f"sk-{s['name']}" for s in mapping["skills"]}

# 非 81 系的出海技能 → lute-brand-icons 的 catalog id。
#
# 这三条此前**没有映射**，靠下面「沿用上一轮 skill-icons.json 里的字节」那条路活着。
# 那条路的代价在 2026-09-15 显形：生成器把衬衫名当颜色传进 shoulders()，
# 产物里是 `fill="W"`/`fill="GL"`（非法值 ⇒ SVG 回落到纯黑），而**这三枚因为是沿用的旧字节，
# 修好生成器也照不到它们** —— 生成器的修复被「上一次的产物」挡在门外。
# 把来源写成表，等于把「上一轮的产物」换回「catalog」这个真正的家：
# 现在 84 枚全部由 catalog 现算，生成器一改就全都跟着改。
EXTRA_ASSIGN = {
    "agent-browser": "qa-tester",
    "lieflat-charts": "data-scientist",
    "self-improvement": "ai-assistant",
}


def main():
    lute = json.load(open(LUTE, encoding="utf-8"))
    by_id = {m["id"]: m["icon"] for m in lute}
    cat_icons = {}
    for key, icon_id in CAT_ASSIGN.items():
        if icon_id not in by_id:
            raise SystemExit(f"缺失头像：{icon_id}")
        cat_icons[key] = by_id[icon_id]
    skill_icons = {}
    # ① 先按显式映射从 catalog 现算（81 系 + EXTRA_ASSIGN 的非 81 系）。
    #    顺序很重要：算完再谈「沿用」，否则沿用会把现算的结果盖掉。
    for name, icon_id in {**SKILL_ASSIGN, **EXTRA_ASSIGN}.items():
        if icon_id not in by_id:
            raise SystemExit(f"缺失头像：{icon_id}（{name}）")
        skill_icons[name] = by_id[icon_id]
    # ② 兜底沿用：既不在 81 系、也不在 EXTRA_ASSIGN 里的名字，保留上一轮字节，
    #    但**必须把保留了谁打出来**。静默沿用正是这三枚带着旧 bug 活下来的原因：
    #    生成器修好了，而它们读的是「上一次的产物」，没人会注意到。
    prev_path = os.path.join(ROOT, "manifest", "skill-icons.json")
    if os.path.isfile(prev_path):
        try:
            prev = json.load(open(prev_path, encoding="utf-8"))
            carried = sorted(n for n in prev if n not in skill_icons)
            for name in carried:
                skill_icons[name] = prev[name]
            if carried:
                print(f"⚠️ 沿用上一轮字节（{len(carried)} 条，未在 81 系或 EXTRA_ASSIGN 里）："
                      f"{', '.join(carried)} —— 若要它们跟着生成器走，请补进 EXTRA_ASSIGN")
        except Exception as e:  # noqa: BLE001
            print(f"⚠️ 读不到上一轮 skill-icons.json，跳过沿用：{e}")
    json.dump(cat_icons, open(os.path.join(ROOT, "manifest", "category-icons.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(skill_icons, open(os.path.join(ROOT, "manifest", "skill-icons.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    # AI全栈：14 个交付节点分组 + 行图标。
    #
    # 2026-09-16 改：分组轴由 8 个「做法类」（fs-clarify…fs-writing）换成 M00–M13 十四个
    # **交付节点**，与 preset 的 persona 派活表、`agent.cordis.yml` 白名单注释同轴。
    # 分组键因此变成 m00…m13，头像 id 也随之是 `fs-cat-m00`…（与既有 `fs-cat-fs-*` 同形）。
    #
    # 行图标只覆盖「有 `sk-fs-<name>` 头像的那部分」：全栈线现在是 138 行，其中 68 行是
    # 2026-09-16 新入的第三方技能，品牌清单里还没有它们各自的头像。缺图**不报错也不编一个**，
    # 而是让它回落到所属节点的分组头像（`build_preset_catalog.py` 的
    # `skill_svg_fs.get(name) or fs_cat_icon.get(category)` 就是这个语义），
    # 并把回落名单打出来 —— 静默回落正是「以为每行都有自己的图」的来源。
    fs_mapping = json.load(open(os.path.join(ROOT, "scripts", "fullstack-mapping.json"), encoding="utf-8"))
    fs_extra = json.load(open(os.path.join(ROOT, "scripts", "fullstack-extra.json"), encoding="utf-8"))
    fs_cat_icons = {}
    for c in fs_mapping["categories"]:
        icon_id = f"fs-cat-{c['key']}"
        if icon_id not in by_id: raise SystemExit(f"缺失头像：{icon_id}（分组「{c['title']}」）")
        fs_cat_icons[c["key"]] = by_id[icon_id]
    fs_names = [s["name"] for s in fs_mapping["skills"]] + \
               [s.get("installAs", s["name"]) for s in fs_extra["skills"]]
    fs_skill_icons = {}
    fellback = []
    for name in fs_names:
        icon_id = f"sk-fs-{name}"
        if icon_id in by_id:
            fs_skill_icons[name] = by_id[icon_id]
        else:
            fellback.append(name)
    if fellback:
        print(f"⚠️ AI全栈 {len(fellback)}/{len(fs_names)} 行无专属头像，回落到所属节点分组头像："
              f"{', '.join(fellback[:6])}{' …' if len(fellback) > 6 else ''}"
              f"（要它们各有其图，得先在 lute-brand-icons 的 catalog.js 里补 sk-fs-<name> 条目再重跑本脚本）")
    json.dump(fs_cat_icons, open(os.path.join(ROOT, "manifest", "category-icons-fs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(fs_skill_icons, open(os.path.join(ROOT, "manifest", "skill-icons-fs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    # 通用线（gn-*）：8 分组 + N 技能。名单的事实源是 manifest/generic-skills.json（**不是**再抄一份映射表）。
    # id 约定与全栈线同形：分组 gn-cat-<key>、技能 sk-gn-<name>。
    generic = json.load(open(os.path.join(ROOT, "manifest", "generic-skills.json"), encoding="utf-8"))
    gn_cat_icons = {}
    for g in generic["groups"]:
        icon_id = f"gn-cat-{g['key']}"
        if icon_id not in by_id: raise SystemExit(f"缺失头像：{icon_id}")
        gn_cat_icons[g["key"]] = by_id[icon_id]
    gn_skill_icons = {}
    for s in generic["skills"]:
        icon_id = f"sk-gn-{s['name']}"
        if icon_id not in by_id: raise SystemExit(f"缺失头像：{icon_id}")
        gn_skill_icons[s["name"]] = by_id[icon_id]
    json.dump(gn_cat_icons, open(os.path.join(ROOT, "manifest", "category-icons-gn.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(gn_skill_icons, open(os.path.join(ROOT, "manifest", "skill-icons-gn.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"分配完成：出海 {len(cat_icons)} 分类/{len(skill_icons)} 技能 | AI全栈 {len(fs_cat_icons)} 分类/{len(fs_skill_icons)} 技能 | 通用 {len(gn_cat_icons)} 分组/{len(gn_skill_icons)} 技能")


if __name__ == "__main__":
    main()
