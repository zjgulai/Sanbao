#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""归位片段自检器 —— 在把片段交给主控之前，先证明它过得了正式校验器的 J1–J6。

## 为什么不能各写一份判据

`scripts/validate_assignments.py` 是归位表的**正式判据**（J1–J6 + 覆盖率）。
如果这个自检器自己再实现一遍规则，就会出现本仓库最熟悉的失效形态：
**两个读取点口径不一致**——自检绿灯、正式校验红灯，或者更糟：自检绿灯、
正式校验因为「覆盖率不是 100%」把整批算成不可复核，而没人注意到。

所以本脚本**直接 import 正式校验器的纯函数**（`validate` / `skill_text` /
`role_text` / `check_quote_form`），把片段**叠加**到真实归位表上再跑一遍。
判据只有一处。

## 用法

    python3 check-fragment.py <fragment.json> [<fragment2.json> ...]

片段格式：`{ "<技能名>": { catalog, scenario, sub, roles[], no_role_kind, no_role_reason } }`

退出码：0 = 片段的每一条都过；1 = 有判据失败；2 = 片段本身读不动 / 技能名不在全栈目录。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent
sys.path.insert(0, str(PKG / "scripts"))

import validate_assignments as V  # noqa: E402  —— 正式判据，不复制

FULLSTACK = PKG / "manifest" / "fullstack-skills.json"


def main() -> int:
    frag_paths = [Path(a) for a in sys.argv[1:]]
    if not frag_paths:
        print(__doc__)
        return 2

    manifest, records, corpus = V.load_inputs()
    catalog_names = {s["name"] for s in json.loads(FULLSTACK.read_text(encoding="utf-8"))["skills"]}

    frag: dict = {}
    for p in frag_paths:
        if not p.is_file():
            print(f"✗ 片段不存在：{p}")
            return 2
        try:
            part = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:                                    # noqa: BLE001
            print(f"✗ {p} 不是合法 JSON：{e}")
            return 2
        if not isinstance(part, dict) or not part:
            print(f"✗ {p} 顶层必须是非空对象 {{技能名: 条目}}")
            return 2
        dup = set(part) & set(frag)
        if dup:
            print(f"✗ {p} 与其它片段重复覆盖：{sorted(dup)}")
            return 2
        frag.update(part)

    unknown = sorted(set(frag) - catalog_names)
    if unknown:
        print(f"✗ 片段里有 {len(unknown)} 条不在 manifest/fullstack-skills.json 的技能名：{unknown}")
        return 2

    # 叠加到真实表上（副本，不落盘）
    merged = json.loads(json.dumps(manifest))
    for name, entry in frag.items():
        merged["skills"][name] = entry

    res = V.validate(merged, records, corpus)
    keys = set(frag)
    mine = [f for f in res["findings"] if str(f["card"]).split("/")[0] in keys]
    warns = [w for w in res["warnings"] if str(w["card"]).split("/")[0] in keys]

    cov = res["coverage"]
    missing_corpus = [n for n in sorted(keys) if n in cov["skill_missing_in_corpus"]]

    print(f"片段 {len(keys)} 条 · 判据失败 {len(mine)} · 告警 {len(warns)}")
    if mine:
        print("\n── 判据失败（J1–J6）──")
        for f in mine:
            print(f"  ✗ [{f['code']}] {f['card']}：{f['detail']}")
    if warns:
        print("\n── 告警（不判失败，但请确认是有意为之）──")
        for w in warns:
            print(f"  🟡 [{w['code']}] {w['card']}：{w['detail']}")
    if missing_corpus:
        print(f"\n  ✗ 这 {len(missing_corpus)} 条在证据语料里没有条目，from_skill 全部不可复核：{missing_corpus}")

    # 局部覆盖率：这批技能的 from_skill / from_role 各自可复核的比例
    frag_mounts = sum(len(v.get("roles") or []) for v in frag.values())
    print(f"\n片段挂载数：{frag_mounts}")

    ok = not mine and not missing_corpus
    print("✓ 片段自检通过" if ok else "✗ 片段未通过，按上面的位置改了再交")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
