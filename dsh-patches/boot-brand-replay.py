#!/usr/bin/env python3
"""Dependency-free replay of the bounded native BootPage seams."""

import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import NamedTuple
import xml.etree.ElementTree as ET


class Invalid(ValueError):
    pass


class Token(NamedTuple):
    kind: str
    value: str
    start: int
    end: int


IDENT = re.compile(r"[A-Za-z_$][\w$]*", re.ASCII)
NUMBER = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")


def require(condition, message):
    if not condition:
        raise Invalid(message)


def quoted_end(source, start):
    quote, i = source[start], start + 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
            if source[i - 1:i + 1] == "\r\n":
                i += 1
        elif source[i] == quote:
            return i + 1
        else:
            require(source[i] not in "\r\n", "newline in quoted literal")
            i += 1
    raise Invalid("unterminated quoted literal")


def js_string(token):
    require(token.kind == "string", "expected a quoted JavaScript string")
    raw, out, i = token.value[1:-1], [], 0
    escapes = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f", "v": "\v"}
    while i < len(raw):
        c, i = raw[i], i + 1
        if c != "\\":
            out.append(c)
            continue
        require(i < len(raw), "incomplete string escape")
        c, i = raw[i], i + 1
        if c in "\r\n":
            if c == "\r" and raw[i:i + 1] == "\n":
                i += 1
            continue
        if c in {"x", "u"}:
            size = 2 if c == "x" else 4
            digits = raw[i:i + size]
            require(len(digits) == size and re.fullmatch(r"[0-9a-fA-F]+", digits), "unsupported string escape")
            out.append(chr(int(digits, 16)))
            i += size
        else:
            require(not c.isdigit(), "unsupported numeric string escape")
            out.append(escapes.get(c, c))
    return "".join(out)


def lex_js(source):
    """Literal bodies are opaque, including nested template interpolations."""
    def regex_end(start):
        i, in_class = start + 1, False
        while i < len(source):
            c = source[i]
            require(c not in "\r\n", "unterminated regex literal")
            if c == "\\":
                i += 2
                continue
            if c == "[":
                in_class = True
            elif c == "]":
                in_class = False
            elif c == "/" and not in_class:
                i += 1
                while i < len(source) and source[i].isalpha():
                    require(source[i] != "v", "unsupported nested regex character sets")
                    i += 1
                return i
            i += 1
        raise Invalid("unterminated regex literal")

    def template_end(start):
        i = start + 1
        while i < len(source):
            if source[i] == "\\":
                i += 2
            elif source[i] == "`":
                return i + 1
            elif source.startswith("${", i):
                _, i = scan(i + 2, True)
            else:
                i += 1
        raise Invalid("unterminated template literal")

    def scan(i, interpolation=False):
        tokens, stack, expression = [], [], True
        while i < len(source):
            c = source[i]
            if c.isspace():
                i += 1
                continue
            if source.startswith("//", i):
                end = re.search(r"[\r\n]", source[i + 2:])
                i = i + 2 + end.start() if end else len(source)
                continue
            if source.startswith("/*", i):
                end = source.find("*/", i + 2)
                require(end >= 0, "unterminated JavaScript comment")
                i = end + 2
                continue
            if c == "}" and not stack and interpolation:
                return tokens, i + 1
            start, kind = i, "punct"
            prev = tokens[-1].value if tokens else ""
            if c in "\"'":
                i, kind, expression = quoted_end(source, i), "string", False
            elif c == "`":
                i, kind, expression = template_end(i), "template", False
            elif c == "/" and expression:
                i, kind, expression = regex_end(i), "regex", False
            elif IDENT.match(source, i):
                i, kind = IDENT.match(source, i).end(), "ident"
                expression = source[start:i] in {
                    "return", "throw", "case", "delete", "void", "typeof", "new",
                    "yield", "await", "else", "do", "in", "instanceof", "of",
                }
            elif NUMBER.match(source, i):
                i = NUMBER.match(source, i).end()
                while i < len(source) and (source[i].isalnum() or source[i] == "_"):
                    i += 1
                kind, expression = "number", False
            elif c in "([{":
                context = "expression"
                if c == "(" and prev in {"if", "while", "for", "with", "switch", "catch"}:
                    context = "control"
                elif c == "{":
                    context = "object" if prev in {"=", "(", "[", ",", ":", "return"} else "block"
                stack.append((c, context))
                i, expression = i + 1, True
            elif c in ")]}":
                require(stack and stack[-1][0] == {")": "(", "]": "[", "}": "{"}[c], "unbalanced JavaScript")
                _, context = stack.pop()
                i, expression = i + 1, context in {"control", "block"}
            else:
                operator = next((op for op in (
                    ">>>=", "===", "!==", "**=", "&&=", "||=", "??=", "...", ">>>",
                    "=>", "==", "!=", "<=", ">=", "++", "--", "&&", "||", "??", "?.",
                    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**",
                ) if source.startswith(op, i)), c)
                i += len(operator)
                expression = operator not in {"++", "--", ".", "?."}
            tokens.append(Token(kind, source[start:i], start, i))
        require(not stack and not interpolation, "unclosed JavaScript delimiters")
        return tokens, i

    return scan(0)[0]


def delimiters(tokens):
    pairs, parents, stack = {}, {}, []
    for i, token in enumerate(tokens):
        parents[i] = stack[-1] if stack else None
        if token.kind != "punct":
            continue
        if token.value in {"(", "[", "{"}:
            stack.append(i)
        elif token.value in {")", "]", "}"}:
            require(stack and tokens[stack[-1]].value == {")": "(", "]": "[", "}": "{"}[token.value],
                    "unbalanced delimiters")
            opening = stack.pop()
            pairs[opening], pairs[i] = i, opening
    require(not stack, "unclosed delimiters")
    return pairs, parents


def values(tokens):
    return [t.value for t in tokens]


def split_tokens(tokens, start, end, pairs, separators):
    chunks, first, i = [], start, start
    while i < end:
        if tokens[i].value in separators and tokens[i].kind == "punct":
            if first < i:
                chunks.append((first, i))
            first = i + 1
        elif i in pairs and pairs[i] > i:
            i = pairs[i]
        i += 1
    if first < end:
        chunks.append((first, end))
    return chunks


def payload_svg(raw):
    svg = raw.decode("utf-8").strip()
    require("<!" not in svg and "<?" not in svg, "XML declarations, entities and comments are unsupported")
    root = ET.fromstring(svg)
    namespace = "{http://www.w3.org/2000/svg}"
    require(root.tag in {"svg", namespace + "svg"}, "payload root must be svg")
    require(root.get("data-brand-wordmark") == "stacked", "payload must be the stacked wordmark")
    common = {"fill", "transform"}
    allowed = {
        "svg": {"viewBox", "width", "role", "aria-label", "data-brand-wordmark", "data-font"},
        "title": set(), "g": common | {"data-status"},
        "path": common | {"d"}, "polygon": common | {"points"},
    }
    ns = namespace if root.tag.startswith(namespace) else ""
    for element in root.iter():
        tag = element.tag[len(ns):] if ns else element.tag
        require(tag in allowed and element.tag == ns + tag, "unsupported SVG element")
        require(element is root or tag != "svg", "nested svg is unsupported")
        require(tag == "title" or not (element.text or "").strip(), "only title may contain text")
        require(not (element.tail or "").strip(), "unexpected SVG text")
        for key, value in element.attrib.items():
            require(key in allowed[tag], "unsupported SVG attribute: " + key)
            require(not re.search(r"url\s*\(|(?:https?:|//|javascript:|data:)", value, re.I), "external/active SVG attribute")
            if key == "fill":
                require(value in {"currentColor", "none"}, "unsupported SVG fill")
            elif key in {"width", "viewBox", "points"}:
                require(re.fullmatch(r"[0-9eE+.,\s-]+", value), "unsupported SVG coordinates")
            elif key == "d":
                require(re.fullmatch(r"[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+", value), "unsupported SVG path")
            elif key == "transform":
                require(re.fullmatch(r"\s*(?:(?:translate|scale)\([0-9eE+.,\s-]+\)\s*)+", value), "unsupported SVG transform")
    require(any(e.tag in {ns + "path", ns + "polygon"} for e in root.iter()), "payload has no paths/polygons")
    return svg


def top_level_constants(tokens, pairs, parents):
    declarations = {}
    for i, token in enumerate(tokens):
        if token.kind != "ident" or token.value not in {"const", "let", "var"} or parents[i] is not None:
            continue
        end = i + 1
        while end < len(tokens) and tokens[end].value != ";":
            end = pairs[end] + 1 if end in pairs and pairs[end] > end else end + 1
        require(end < len(tokens), "unsupported unterminated top-level declaration")
        for start, stop in split_tokens(tokens, i + 1, end, pairs, {","}):
            if stop - start >= 3 and tokens[start].kind == "ident" and tokens[start + 1].value == "=":
                declarations.setdefault(tokens[start].value, []).append((token.value, start + 2, stop))
    return declarations


def spinner_class(tokens, pairs, parents, map_name):
    declarations = top_level_constants(tokens, pairs, parents)

    def const_value(name):
        found = declarations.get(name, [])
        require(len(found) == 1 and found[0][0] == "const", "missing/ambiguous const: " + name)
        return found[0][1:]

    start, stop = const_value(map_name)
    require(tokens[start].value == "{" and pairs.get(start) == stop - 1, "CSS map must be a plain object")
    fields = {}
    for a, b in split_tokens(tokens, start + 1, stop - 1, pairs, {","}):
        require(b - a == 3 and tokens[a].kind in {"ident", "string"} and tokens[a + 1].value == ":",
                "unsupported CSS map property")
        key = js_string(tokens[a]) if tokens[a].kind == "string" else tokens[a].value
        require(key not in fields, "duplicate CSS map field")
        fields[key] = tokens[a + 2]
    require("spinner" in fields and "wordmark" in fields, "CSS map fields missing")
    token = fields["spinner"]
    if token.kind == "ident":
        a, b = const_value(token.value)
        require(b - a == 1, "spinner class must resolve to a string const")
        token = tokens[a]
    name = js_string(token)
    require(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", name), "unsupported spinner class name")
    for i, t in enumerate(tokens[:-3]):
        if t.kind == "ident" and t.value == map_name:
            if tokens[i + 1].value == ".":
                require(tokens[i + 3].value not in {"=", "+=", "??=", "||=", "&&=", "++", "--"}, "CSS map mutation")
            elif tokens[i + 1].value == "[":
                raise Invalid("computed CSS map access is unsupported")
    return name


def plan_js(source, svg):
    tokens = lex_js(source)
    pairs, parents = delimiters(tokens)
    candidates = []
    for i, token in enumerate(tokens):
        if token.kind != "ident" or token.value != "class" or (i and tokens[i - 1].value in {".", "?."}):
            continue
        j = i + 1
        if j < len(tokens) and tokens[j].kind == "ident" and tokens[j].value != "extends":
            j += 1
        if j < len(tokens) and tokens[j].value == "extends":
            j += 1
            while j < len(tokens) and (tokens[j].kind == "ident" or tokens[j].value == "."):
                j += 1
        if j >= len(tokens) or tokens[j].value != "{":
            continue
        end = pairs[j]
        if any(values(tokens[k:k + 3]) == ["this", ".", "wordmark"] for k in range(j + 1, end)):
            require(j - i in {1, 2} and tokens[i + 1].value != "extends",
                    "inherited boot classes are unsupported")
            candidates.append((j, end))
    if not candidates:
        return None
    require(len(candidates) == 1, "multiple wordmark classes")
    opening, closing = candidates[0]
    require(parents[opening] is None, "nested boot class is unsupported")
    constructors = [i for i in range(opening + 1, closing)
                    if parents[i] == opening and tokens[i].value == "constructor"]
    require(len(constructors) == 1, "missing/duplicate constructor")
    ctor = constructors[0]
    require(ctor == opening + 1 or tokens[ctor - 1].value in {";", "}"},
            "static/accessor constructor is unsupported")
    require(tokens[ctor + 1].value == "(", "unsupported constructor")
    params_end = pairs[ctor + 1]
    body = params_end + 1
    require(tokens[body].value == "{", "constructor body missing")
    body_end = pairs[body]
    params = tokens[ctor + 2:params_end]
    require(all(t.kind == "ident" or t.value == "," for t in params), "unsupported constructor parameters")
    for field in ("wordmark", "spinner"):
        declarations = [i for i in range(opening + 1, closing)
                        if parents[i] == opening and tokens[i].value == field]
        require(len(declarations) <= 1 and all(tokens[i + 1].value == ";" for i in declarations),
                "duplicate or initialized boot field")
    for i in range(opening + 1, closing):
        if parents[i] == opening:
            require(tokens[i].kind != "string" and tokens[i].value != "[",
                    "quoted/computed class members are unsupported")
        if tokens[i].kind == "template" and "${" in tokens[i].value:
            require(re.fullmatch(r"`\$\{String\(Math\.round\([0-9.+* /()-]+[A-Za-z_$][\w$]*[0-9.+* /()-]*\)\)\}deg`",
                                 tokens[i].value), "unsupported executable boot template")
        require(tokens[i].kind != "ident" or tokens[i].value not in {"eval", "Function"}, "dynamic code inside boot class")
        if tokens[i].kind == "ident" and tokens[i].value == "this":
            require(tokens[i + 1].value == "." and tokens[i + 2].kind == "ident",
                    "aliased/computed this access inside boot class")
    require(all(t.kind in {"string", "ident", "number"} or t.value not in {
        "{", "}", "[", "]", "=>", "?", "&&", "||", "??",
    } for t in tokens[body + 1:body_end]), "constructor must use straight-line assignments and calls")
    require(all(t.kind not in {"template", "regex"} for t in tokens[body + 1:body_end]), "constructor literals unsupported")
    expressions = split_tokens(tokens, body + 1, body_end, pairs, {",", ";"})
    wordmarks, spinners, markers = [], [], []
    for index, (a, b) in enumerate(expressions):
        v = values(tokens[a:b])
        require(v and tokens[a].kind == "ident" and (v[0] == "this" or v[0] in values(params)), "unsupported constructor expression")
        if v[:4] == ["this", ".", "wordmark", "="]:
            require(len(v) == 12 and tokens[a + 4].kind == "ident" and v[5] == "("
                    and tokens[a + 6].kind == "ident" and v[7:10] == [".", "wordmark", ","]
                    and tokens[a + 10].kind == "string" and v[11] == ")", "unsupported wordmark constructor call")
            wordmarks.append((index, a, b, v[4], v[6]))
        if v[:4] == ["this", ".", "spinner", "="]:
            require(len(v) == 10 and tokens[a + 4].kind == "ident" and v[5] == "("
                    and tokens[a + 6].kind == "ident" and v[7:] == [".", "spinner", ")"], "unsupported spinner constructor call")
            spinners.append((a, b, v[4], v[6]))
        if v[:7] == ["this", ".", "spinner", ".", "dataset", ".", "dshBootSpinner"]:
            require(len(v) == 9 and v[7] == "=" and tokens[a + 8].kind == "string", "unsupported spinner dataset marker")
            markers.append(a)
    require(len(wordmarks) == len(spinners) == len(markers) == 1, "missing/duplicate boot fields or marker")
    index, a, b, helper, map_name = wordmarks[0]
    sa, sb, spinner_helper, spinner_map = spinners[0]
    require((helper, map_name) == (spinner_helper, spinner_map), "boot helper/CSS map mismatch")
    require(map_name not in values(params) and helper not in values(params), "shadowed boot bindings")
    require(a < sa < markers[0], "unsupported boot initialization order")
    existing = None
    if index + 1 < len(expressions):
        x, y = expressions[index + 1]
        if values(tokens[x:x + 5]) == ["this", ".", "wordmark", ".", "innerHTML"]:
            require(y - x == 7 and tokens[x + 5].value == "=" and tokens[x + 6].kind == "string", "unsupported adjacent innerHTML assignment")
            existing = (x, y)
    allowed = {a} | ({existing[0]} if existing else set())
    for i in range(opening + 1, closing):
        if values(tokens[i:i + 3]) == ["this", ".", "wordmark"] and i not in allowed:
            p = parents[i]
            require(tokens[i + 3].value in {",", ")"} and p is not None and tokens[p].value == "("
                    and tokens[p - 1].value in {"append", "replaceChildren"} and tokens[p - 2].value == ".",
                    "competing or unsupported wordmark use")
        if values(tokens[i:i + 4]) == ["this", ".", "spinner", "="]:
            require(i == sa, "duplicate spinner assignment")
    name = spinner_class(tokens, pairs, parents, map_name)
    literal = json.dumps(svg, ensure_ascii=True, separators=(",", ":"))
    edits = []
    if js_string(tokens[a + 10]) != "":
        edits.append((tokens[a + 10].start, tokens[a + 10].end, '""'))
    if existing:
        old = tokens[existing[0] + 6]
        if js_string(old) != svg:
            edits.append((old.start, old.end, literal))
    else:
        position = tokens[b - 1].end
        edits.append((position, position, ",this.wordmark.innerHTML=" + literal))
    for start, end, replacement in sorted(edits, reverse=True):
        source = source[:start] + replacement + source[end:]
    return source, name


def lex_css(source):
    tokens, i = [], 0
    while i < len(source):
        c = source[i]
        if c.isspace():
            i += 1
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            require(end >= 0, "unterminated CSS comment")
            i = end + 2
            continue
        start, kind = i, "punct"
        if c in "\"'":
            i, kind = quoted_end(source, i), "string"
        elif NUMBER.match(source, i):
            i = NUMBER.match(source, i).end()
            while i < len(source) and (source[i].isalpha() or source[i] == "%"):
                i += 1
            kind = "number"
        elif re.match(r"[A-Za-z_-]", c):
            i += 1
            while i < len(source) and re.match(r"[A-Za-z0-9_-]", source[i]):
                i += 1
            kind = "ident"
        elif c == "\\":
            match = re.match(r"\\(?:[0-9a-fA-F]{1,6}\s?|.)", source[i:])
            require(match, "unterminated CSS escape")
            i += match.end()
            kind = "escape"
        else:
            i += 1
        tokens.append(Token(kind, source[start:i], start, i))
    return tokens


def css_rules(source):
    tokens = lex_css(source)
    pairs, parents = delimiters(tokens)
    rules, keyframes, boundaries = [], set(), {}
    for i, token in enumerate(tokens):
        if token.kind != "punct":
            continue
        p = parents[i]
        if token.value == "{":
            start = boundaries.get(p, (p + 1) if p is not None else 0)
            prelude = tokens[start:i]
            is_keyframes = (len(prelude) >= 2 and prelude[0].value == "@"
                            and prelude[1].value.lower() in {"keyframes", "-webkit-keyframes"})
            if is_keyframes or p in keyframes:
                keyframes.add(i)
            elif prelude and prelude[0].value != "@":
                declarations = []
                for a, b in split_tokens(tokens, i + 1, pairs[i], pairs, {";"}):
                    if b - a >= 2 and tokens[a].kind == "ident" and tokens[a + 1].value == ":":
                        declarations.append((tokens[a].value.lower(), tokens[a + 2:b]))
                    else:
                        declarations.append(("unsupported", tokens[a:b]))
                rules.append((prelude, declarations, p))
        elif token.value == ";":
            boundaries[p] = i + 1
        elif token.value == "}":
            boundaries[parents[pairs[i]]] = i + 1
    return rules


def plan_css(sources, name):
    candidates = []
    for path, source in sources:
        for selector, declarations, parent in css_rules(source):
            v = values(selector)
            animation = [(key, val) for key, val in declarations
                         if key in {"all", "animation", "-webkit-animation"} or key.startswith("animation-")
                         or key.startswith("-webkit-animation-")]
            mentions = any(v[i:i + 2] == [".", name] for i in range(len(v)))
            marker = any(t.kind == "ident" and t.value == "data-dsh-boot-spinner" for t in selector)
            require(not (marker and animation), "data-dsh-boot-spinner rule overrides animation")
            opaque = any(t.kind == "escape" or (t.kind == "string" and name in t.value) for t in selector)
            require(not (opaque and animation), "escaped/attribute spinner animation selector")
            if not mentions:
                continue
            if v in [[".", name, ":", "after"], [".", name, ":", ":", "after"]]:
                continue
            require(all(key != "unsupported" for key, _ in declarations), "unsupported spinner declaration")
            if v != [".", name]:
                require(not animation, "non-bare spinner rule overrides animation")
                continue
            require(parent is None, "conditional/nested spinner rule is unsupported")
            require(len(animation) == 1 and animation[0][0] == "animation", "spinner requires one shorthand and no animation overrides")
            value = animation[0][1]
            require(len(value) == 4 and value[0].kind == "ident"
                    and re.fullmatch(r"(?:spin|_spin_[A-Za-z0-9_]+)", value[0].value)
                    and value[1].kind == "number"
                    and re.fullmatch(r"(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)", value[1].value)
                    and values(value[2:]) == ["linear", "infinite"], "unsupported spinner animation shorthand")
            candidates.append((path, source, value[1]))
    require(len(candidates) == 1, "missing/ambiguous bare spinner rule")
    path, source, duration = candidates[0]
    return path, source[:duration.start] + "2s" + source[duration.end:]


def preflight(assets, payload):
    require(assets.is_dir(), "assets directory missing")
    paths = sorted(p for p in assets.iterdir() if p.suffix in {".js", ".css"})
    originals, modes = {}, {}
    for path in paths:
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode), "asset must be a regular file: " + str(path))
        originals[path] = path.read_bytes()
        modes[path] = stat.S_IMODE(info.st_mode)
    svg = payload_svg(payload.read_bytes())
    sources = {path: raw.decode("utf-8") for path, raw in originals.items()}
    candidates = []
    for path, source in sources.items():
        if path.suffix == ".js":
            result = plan_js(source, svg)
            if result is not None:
                candidates.append((path, *result))
    require(len(candidates) == 1, "missing/ambiguous boot constructor across assets")
    js_path, javascript, name = candidates[0]
    css_path, css = plan_css([(p, s) for p, s in sources.items() if p.suffix == ".css"], name)
    changes = [("wordmark", js_path, javascript.encode("utf-8")), ("boot-spin", css_path, css.encode("utf-8"))]
    return originals, modes, changes


def stage(path, content, mode):
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        return temporary
    except BaseException:
        os.unlink(temporary)
        raise


def apply_changes(originals, modes, changes):
    """Stage replacements and rollback bytes before replacing either asset."""
    pending, backups, committed = {}, {}, []
    try:
        for _, path, content in changes:
            if content != originals[path]:
                backups[path] = stage(path, originals[path], modes[path])
                pending[path] = stage(path, content, modes[path])
        for path, original in originals.items():
            require(path.read_bytes() == original and not path.is_symlink(), "asset changed after preflight: " + str(path))
        for path, temporary in pending.items():
            os.replace(temporary, path)
            committed.append(path)
        for temporary in backups.values():
            os.unlink(temporary)
    except BaseException as error:
        failures = []
        for path in reversed(committed):
            try:
                backup = backups[path]
                if not os.path.exists(backup):
                    backup = stage(path, originals[path], modes[path])
                    backups[path] = backup
                os.replace(backup, path)
            except OSError as rollback_error:
                failures.append(str(path) + ": " + str(rollback_error))
        if failures:
            raise Invalid("write failed; rollback also failed: " + "; ".join(failures)) from error
        raise
    finally:
        for temporary in list(pending.values()) + list(backups.values()):
            if os.path.exists(temporary):
                os.unlink(temporary)


def main(argv):
    if len(argv) != 4 or argv[3] not in {"--check", "--apply"}:
        print("usage: python3 boot-brand-replay.py <assetsDir> <svgPayloadPath> <--check|--apply>", file=sys.stderr)
        return 2
    try:
        originals, modes, changes = preflight(Path(argv[1]).absolute(), Path(argv[2]).absolute())
        if argv[3] == "--apply":
            apply_changes(originals, modes, changes)
        drift = False
        for label, path, content in changes:
            changed = content != originals[path]
            status = "APPLY" if changed and argv[3] == "--apply" else "DRIFT" if changed else "OK  "
            print(f"{status} {label} {path.name}")
            drift |= changed
        return int(drift and argv[3] == "--check")
    except (OSError, ValueError, ET.ParseError, RecursionError) as error:
        print("DRIFT wordmark/boot-spin: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
