#!/usr/bin/env python3
"""brand-replay-strings —— app 本体里「历史品牌名」的扫描与重放。

## 为什么是扫描而不是文件清单

2026-09-20 Sanbao 改名落地实测：块 1 的「9 文件清单」漏了 8 个带品牌的文件
（notifications-*、tray-locale-*、src-*.js、native-ui/assets/* 等分块），而基座每次
升级都可能带来新分块——那是一份会腐烂的纪律。扫描是机制：凡 app 本体（排除
node_modules 与 *.orig* 备份）里还带着历史名的文本文件，都在面上。

清单式另有一个静态不可见的问题：`--check` 只看得见清单内的漂移，清单外漏成什么样
它一无所知（P-02 假绿）。

## 历史名（要换成 $brand 的名字）

由调用方传入（brand-replay.sh 的 PREV_NAMES 是「曾用名」的唯一家）。
唯一**不**在这里处理的名字是基座平台名（DeepSeek Harness）——很多地方在正确地
指代上游事实，只有窗口标题位是产品名（归 brand-replay.sh 的 2b 块）。

## 豁免（改了会吞掉别的补丁的锚点，或违反「路径 join 不可替换」）

  · `productName: "…"`            —— 身份表，归 `dsh-patches/app-identity-sanbao`；
  · `app.setPath("userData", …)`  —— 数据目录路径（ADR 纪律：路径 join 不替换）。

豁免按**行**判定、显式报 SKIP——静默跳过会让「改了没生效」和「本来就不该改」
看起来一模一样。

用法: brand-replay-strings.py --check|--apply <chk-root> <brand> <prev-name> [<prev-name>...]
退出码: 0 = 无漂移；1 = 有漂移（check）/ 写后残留或扫描面为空（apply/check 都判）
"""

import os
import sys

SCAN_EXTENSIONS = (".js", ".cjs", ".mjs", ".html", ".css", ".json", ".yml", ".yaml", ".svg")
EXEMPT_MARKERS = ("productName:", 'app.setPath("userData"')


def is_exempt(line, names):
    return any(m in line for m in EXEMPT_MARKERS) and any(n in line for n in names)


def analyze(text, names):
    """非豁免行的历史名出现次数（按名字计）与豁免行数。"""
    hits, exempt = {}, 0
    for line in text.split("\n"):
        if not any(n in line for n in names):
            continue
        if is_exempt(line, names):
            exempt += 1
            continue
        for n in names:
            c = line.count(n)
            if c:
                hits[n] = hits.get(n, 0) + c
    return hits, exempt


def replace(text, names, brand):
    out = []
    for line in text.split("\n"):
        if any(n in line for n in names) and not is_exempt(line, names):
            for n in names:
                line = line.replace(n, brand)
        out.append(line)
    return "\n".join(out)


def scan(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d != "node_modules")
        for fn in sorted(filenames):
            if fn.endswith(".map") or ".orig" in fn:
                continue
            if fn.endswith(SCAN_EXTENSIONS):
                yield os.path.join(dirpath, fn)


def read(path):
    with open(path, encoding="utf-8", errors="surrogateescape") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
        fh.write(text)


def spec_of(hits, names):
    return " ".join("%s×%d" % (n, hits[n]) for n in names if n in hits)


def main():
    if len(sys.argv) < 5 or sys.argv[1] not in ("--check", "--apply"):
        print(
            "用法: brand-replay-strings.py --check|--apply <chk-root> <brand> <prev-name>...",
            file=sys.stderr,
        )
        return 2
    mode, root, brand, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
    if not os.path.isdir(root):
        print("MISSING %s（扫描面根不存在）" % root, file=sys.stderr)
        return 1

    rc, scanned, touched = 0, 0, 0
    for path in scan(root):
        scanned += 1
        rel = os.path.relpath(path, root)
        text = read(path)
        hits, exempt = analyze(text, names)
        total = sum(hits.values())
        if total and mode == "--apply":
            write(path, replace(text, names, brand))
            residue, _ = analyze(read(path), names)
            if sum(residue.values()):
                print("ERROR %s 写后仍残留 %s" % (rel, residue), file=sys.stderr)
                rc = 1
            else:
                print("APPLY %s (%s → %s)" % (rel, spec_of(hits, names), brand))
                touched += 1
        elif total:
            print("DRIFT %s (%s) — 跑 --apply" % (rel, spec_of(hits, names)))
            rc = 1
        elif exempt:
            print("SKIP %s (豁免行×%d：身份表/数据目录路径)" % (rel, exempt))
        elif brand in text:
            print("OK   %s (%s×%d)" % (rel, brand, text.count(brand)))

    if scanned == 0:
        print(
            "MISSING %s 下没有可扫描的文本文件（白名单 %s）——扫描面为空即判据失效"
            % (root, " ".join(SCAN_EXTENSIONS)),
            file=sys.stderr,
        )
        rc = 1
    print("[strings] 扫描 %d 个文本文件，落笔 %d 个" % (scanned, touched))
    return rc


if __name__ == "__main__":
    sys.exit(main())
