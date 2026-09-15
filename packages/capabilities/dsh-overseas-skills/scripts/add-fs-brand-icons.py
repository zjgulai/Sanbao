#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把本批 40 条 AI 全栈技能的 LUTE 头像补进图标库 catalog，并重建 manifest。

## 为什么需要一个脚本（而不是手改 40 行 JS）

`assets/manifest.json`（270 枚）是从 `scripts/catalog.js` **构建**出来的。
手改 manifest 会被下一次 `build.js` 抹掉；而手改 catalog 的 40 行要保证
①按 id 归入既有 `sk-fs-*` 块且保持字母序、②视觉属性（肤色/发型/衬衫/徽章色）
不出现连续雷同、③不碰其它 230 行。这三件事都是机械的，机械的事交给脚本，
人也就不必“记得”。

本机资产（不进仓库）：`~/.dsh/skills/lute-brand-icons/`。
仓库侧的对应物是 `scripts/assign_lute_icons.py`（读 manifest → 写
`manifest/skill-icons-fs.json`），它要求 catalog 里已有 `sk-fs-<name>`。
"""

import json
import os
import subprocess
import sys

LUTE = os.path.expanduser("~/.dsh/skills/lute-brand-icons")
CATALOG = os.path.join(LUTE, "scripts", "catalog.js")

# ── 40 条技能 → 胸口徽章 ──
# 选型口径：徽章要在 16px 下能读出一件事，且与该技能**做的那件事**同型。
# 同名徽章在本库里重复是常态（既有的 `document` 就出现十几次）；
# 本批刻意把重复压到 ≤2 次，并让「同型技能共用一枚」成为有意的选择
# （`refactor` 与 `agent-md-refactor` 共用剪刀即属此类）。
EMBLEM = {
    "accessibility": "heart",
    "agent-md-refactor": "scissors",
    "agentic-eval": "check",
    "api-designer": "braces",
    "ci-cd-and-automation": "play",
    "clickhouse-architecture-advisor": "chart",
    "code-documenter": "book",
    "content-modeling-best-practices": "tablet",
    "crafting-effective-readmes": "feather",
    "data-context-extractor": "magnifier",
    "dbt-transformation-patterns": "folder",
    "dependency-updater": "backpack",
    "dispatching-parallel-agents": "sparkle",
    "finishing-a-development-branch": "trophy",
    "git-commit": "pen",
    "git-workflow-and-versioning": "star",
    "github-gem-seeker": "bulb",
    "graphql-architect": "server",
    "incident-retrospective": "bell",
    "langchain-architecture": "chip",
    "make-repo-contribution": "briefcase",
    "markdown-to-html": "laptop",
    "observability-and-instrumentation": "gauge",
    "performance": "rocket",
    "pnpm-upgrade": "gear",
    "postgres": "server",
    "prometheus-configuration": "bell",
    "prompt-engineer": "bubble",
    "refactor": "scissors",
    "slo-implementation": "shield",
    "spark-optimization": "chip",
    "spec-driven-development": "document",
    "sql-optimization-patterns": "calculator",
    "sql-queries": "calculator",
    "supabase-postgres-best-practices": "shield",
    "turborepo": "truck",
    "verification-before-completion": "check",
    "web-design-reviewer": "camera",
    "web-perf": "magnifier",
    "writing-plans": "document",
}

# 三枚「宝宝」—— 与既有 sk-fs 块同比例（30 条里 2 条）。宝宝不用成人配饰，
# 领口改围兜（bibG/bibW），这是 generator 的既有约定。
BABIES = {"git-commit", "markdown-to-html", "pnpm-upgrade"}

# 成人发型：既有 catalog 里 `nightcap`（睡帽）只出现在宝宝条目上，成人不排。
HAIR_PARTS = [
    "short", "slick", "quiff", "buzz", "bob", "bun", "highbun", "ponytail",
    "tuft", "curls", "sideFringe", "beret", "headband", "sideGray",
]
HAIR_COLORS = ["black", "brown", "chestnut", "auburn"]
SHIRTS = ["G", "GD", "GL", "MINT", "W"]
# 衬衫 → 领口：与既有 sk-fs 块逐条核对过的映射，不是新规则。
COLLAR_OF = {"G": "none", "GD": "collarW", "GL": "collarG", "MINT": "collarG", "W": "tieW"}
BABY_COLLAR_OF = {"G": "bibG", "GD": "bibW", "GL": "bibG", "MINT": "bibG", "W": "bibW"}
ACCS = ["glassesRect", "glassesRound", "earrings", "stubble", "beard", "headset"]


def attrs(i, name):
    """按序号轮转视觉属性。步长与周期互质，避免出现肉眼可见的条纹。"""
    baby = name in BABIES
    skin = f"s{1 + (i % 4)}"
    # 步长必须与 HAIR_PARTS 长度互质，否则会出现「只用到两种发型」的隐形条纹
    # —— 第一版用了步长 7（gcd(7,14)=7），40 条里只有两种发型在交替。
    part = HAIR_PARTS[(i * 5) % len(HAIR_PARTS)]
    color = "gray" if part == "sideGray" else HAIR_COLORS[(i * 3) % len(HAIR_COLORS)]
    shirt = SHIRTS[(i * 3) % len(SHIRTS)]
    a = {
        "baby": baby,
        "skin": skin,
        "hair": [f"{part}:{color}"],
        "grayBrows": part == "sideGray",
        "shirt": shirt,
        "collar": (BABY_COLLAR_OF if baby else COLLAR_OF)[shirt],
    }
    if baby:
        if i % 2 == 0:
            a["acc"] = ["glassesRoundBaby"]
    elif i % 5 == 1 or i % 5 == 4:
        a["acc"] = [ACCS[(i * 5) % len(ACCS)]]
    a["blush"] = (not baby) and i % 7 == 2
    return a


def line_for(i, name):
    a = attrs(i, name)
    parts = [f'"id": "sk-fs-{name}"', f'"name": "{name}"', '"cat": "AI全栈技能"']
    if a["baby"]:
        parts.append('"baby": true')
    parts += [f'"skin": "{a["skin"]}"', f'"hair": {json.dumps(a["hair"])}']
    if a["grayBrows"]:
        parts.append('"grayBrows": true')
    # 尾段顺序照抄既有 sk-fs 块：shirt → collar → emblem → blush → acc
    parts += [f'"shirt": "{a["shirt"]}"', f'"collar": "{a["collar"]}"', f'"emblem": "{EMBLEM[name]}"']
    if a["blush"]:
        parts.append('"blush": true')
    if a.get("acc"):
        parts.append(f'"acc": {json.dumps(a["acc"])}')
    return "  {" + ", ".join(parts) + "},"


def main():
    write = "--write" in sys.argv
    names = sorted(EMBLEM)
    assert len(names) == 40, f"应为 40 条，实为 {len(names)}"

    src = open(CATALOG, encoding="utf-8").read()
    lines = src.split("\n")

    idx = [i for i, l in enumerate(lines) if '"id": "sk-fs-' in l]
    assert idx == list(range(idx[0], idx[-1] + 1)), "既有 sk-fs 块不是连续的，拒绝改"
    existing_names = {l.split('"name": "')[1].split('"')[0] for l in lines[idx[0]:idx[-1] + 1]}

    todo = [n for n in names if n not in existing_names]
    print(f"既有 sk-fs 条目 {len(existing_names)} 条；本批新增 {len(todo)} 条")

    merged = lines[idx[0]:idx[-1] + 1]
    for i, name in enumerate(names):
        if name in existing_names:
            continue
        merged.append(line_for(i, name))
    merged.sort(key=lambda l: l.split('"id": "')[1].split('"')[0])
    assert len(merged) == len(existing_names) + len(todo)

    out = lines[:idx[0]] + merged + lines[idx[-1] + 1:]
    rendered = "\n".join(out)
    print(f"catalog.js：{len(lines)} 行 → {len(out)} 行")

    if not write:
        print("\n（预览：新增行如下。加 --write 落盘）")
        for i, name in enumerate(names):
            if name not in existing_names:
                print(line_for(i, name))
        return

    open(CATALOG, "w", encoding="utf-8").write(rendered)
    print(f"✓ 已写入 {CATALOG}")

    print("→ node scripts/build.js")
    r = subprocess.run(["node", "scripts/build.js"], cwd=LUTE, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        sys.exit(r.returncode)

    man = json.load(open(os.path.join(LUTE, "assets", "manifest.json"), encoding="utf-8"))
    ids = {m["id"] for m in man}
    missing = [f"sk-fs-{n}" for n in names if f"sk-fs-{n}" not in ids]
    print(f"manifest：{len(man)} 枚；本批 40 条缺失 {len(missing)} 枚 {missing}")


if __name__ == "__main__":
    main()
