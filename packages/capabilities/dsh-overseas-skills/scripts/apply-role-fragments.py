#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一批归位片段合进 `manifest/role-assignments.json`，并同步所有派生计数。

## 为什么需要它

归位表有**四个数字**是它的派生量：`coverage.skills / with_roles / without_roles /
role_ids_with_supply`，另有一处散文描述 `_meta.purpose` 里的线别条数。
它们在门禁里被交叉核对（`test/doc-counts.spec.mjs` 断言 README 的条数 ==
`manifest.skills` 条数 == `coverage.skills`；`test/role-map.spec.mjs` 断言
`lib/role-map.js` 是 manifest 的精确投影）。手工 merge 一次要同时改五处，
漏一处的表现是「门禁报一个和本次改动看不出关系的错」。

## 与 `promote-intake-batch.mjs` 同一条纪律

写盘前先证明「零改动往返逐字节相同」。`role-assignments.json` 是
`json.dumps(indent=2, ensure_ascii=False)` 且**无**末尾换行；用别的口径重写会炸出
全文件 diff，把真实改动埋掉。

## 用法

    python3 scripts/apply-role-fragments.py /tmp/fs40-roles/frag-P.json /tmp/.../frag-Q.json ...
    python3 scripts/apply-role-fragments.py --check <frag>...     # 只校验，不写盘

片段格式见 `check-fragment.py`：`{技能名: {catalog, scenario, sub, roles, no_role_kind, no_role_reason}}`。
合并前会先用 `check-fragment.py` 的同一份判据跑一遍；**判据失败即拒绝写盘**。
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
MANIFEST = PKG / "manifest" / "role-assignments.json"
FULLSTACK = PKG / "manifest" / "fullstack-skills.json"
CHECKER = PKG / "check-fragment.py"

# 线别 → 该线在 fullstack/generic 目录里的条数从目录读，不写死；
# `_meta.purpose` 里的「AI全栈（N）」因此不会随批次增长而腐烂。
PURPOSE_TMPL = "出海技能（{overseas}）+ AI全栈（{fs}）→ 《AI组织变革》50 岗位的归位判定；页面「出海技能」四层下钻的数据源。"


def serialize(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def recompute_coverage(skills: dict) -> dict:
    """覆盖度是**派生量**：只由表本身决定，不接受调用方传入。"""
    with_roles = sum(1 for v in skills.values() if v.get("roles"))
    ids = {r["id"] for v in skills.values() for r in (v.get("roles") or [])}
    return {
        "skills": len(skills),
        "with_roles": with_roles,
        "without_roles": len(skills) - with_roles,
        "role_ids_with_supply": len(ids),
    }


def main() -> int:
    argv = sys.argv[1:]
    check_only = "--check" in argv
    frag_paths = [Path(a) for a in argv if not a.startswith("--")]
    if not frag_paths:
        print(__doc__)
        return 2

    # ① 先跑正式判据（叠加后校验），失败就停 —— 不让未过判据的片段落盘。
    r = subprocess.run([sys.executable, str(CHECKER), *map(str, frag_paths)],
                       capture_output=True, text=True)
    print(r.stdout.rstrip())
    if r.returncode != 0:
        print("\n✗ 片段未过判据，拒绝写盘。", file=sys.stderr)
        return 1

    frag: dict = {}
    for p in frag_paths:
        part = json.loads(p.read_text(encoding="utf-8"))
        dup = set(part) & set(frag)
        if dup:
            print(f"✗ 片段重复覆盖：{sorted(dup)}", file=sys.stderr)
            return 2
        frag.update(part)

    raw = MANIFEST.read_text(encoding="utf-8")
    table = json.loads(raw)

    # ② 序列化守卫：零改动往返必须逐字节相同。
    if serialize(table) != raw:
        print("✗ 序列化守卫失败：重新序列化与磁盘文件不一致（期望 indent=2、无末尾换行）。"
              "拒绝写盘。", file=sys.stderr)
        return 2

    skills = table["skills"]
    overwrite = sorted(set(frag) & set(skills))
    if overwrite:
        print(f"✗ 这 {len(overwrite)} 条已在表里，本脚本只做追加：{overwrite}", file=sys.stderr)
        return 2

    # ③ 新条目按**全栈目录顺序**落位，而不是按片段里的字典序 ——
    #    表的可读性依赖「同一条线相邻」，这是既有 253 条的既有形态。
    order = [s["name"] for s in json.loads(FULLSTACK.read_text(encoding="utf-8"))["skills"]]
    rank = {n: i for i, n in enumerate(order)}
    placed = 0
    for name in sorted(frag, key=lambda n: (rank.get(n, 10**6), n)):
        skills[name] = frag[name]
        placed += 1

    table["coverage"] = recompute_coverage(skills)
    fs_count = sum(1 for v in skills.values() if v.get("catalog") == "fs")
    overseas = sum(1 for v in skills.values() if v.get("catalog") == "overseas")
    table["_meta"]["purpose"] = PURPOSE_TMPL.format(overseas=overseas, fs=fs_count)

    print(f"\n新增 {placed} 条 → 表共 {len(skills)} 条")
    print(f"  coverage: {json.dumps(table['coverage'], ensure_ascii=False)}")
    print(f"  _meta.purpose: {table['_meta']['purpose']}")

    if check_only:
        print("\n（--check：未写盘）")
        return 0

    MANIFEST.write_text(serialize(table), encoding="utf-8")
    print(f"✓ 已写入 {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
