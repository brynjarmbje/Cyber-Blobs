from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CSS_FILES = [
    ROOT / "style.base.css",
    ROOT / "style.modals.css",
    ROOT / "style.hud.css",
    ROOT / "style.screens.css",
]
HTML_FILES = [ROOT / "index.html"] + sorted((ROOT / "views").glob("*.html"))
JS_FILES = sorted((ROOT / "src").rglob("*.js")) + sorted((ROOT / "js").rglob("*.js"))


def strip_css_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def css_preludes(css_text: str) -> list[str]:
    """Return the prelude (selector / at-rule header) before each '{'.

    This intentionally avoids scanning declaration blocks so we don't accidentally
    treat color hex values like '#fff' as an id selector.
    """
    # Regex is sufficient here because CSS doesn't allow '{' inside declarations
    # except in rare edge cases (e.g. custom properties containing '{').
    # For this repo, this is a good pragmatic tradeoff.
    return [m.group(1).strip() for m in re.finditer(r"([^{}]+)\{", css_text)]


def tokenize_css_classes_and_ids(css_text: str) -> tuple[set[str], set[str]]:
    # Simple selector token scan (not a full CSS parser): find .class and #id
    # tokens in rule preludes only.
    classes: set[str] = set()
    ids: set[str] = set()

    for prelude in css_preludes(css_text):
        if not prelude or prelude.startswith("@"):
            # Skip @media/@keyframes headers themselves; inner rules still get
            # picked up by the regex as separate preludes.
            continue

        for m in re.finditer(r"(?<![A-Za-z0-9_-])\.([A-Za-z0-9_-]+)", prelude):
            token = m.group(1)
            # Ignore decimal numbers like `.5` that can appear in minified-ish CSS
            # (this repo had false positives here).
            if token and not token[0].isdigit():
                classes.add(token)

        for m in re.finditer(r"(?<![A-Za-z0-9_-])#([A-Za-z0-9_-]+)", prelude):
            token = m.group(1)
            # Ignore hex colors accidentally matched as ids.
            if token and re.fullmatch(r"[0-9a-fA-F]+", token) and len(token) in (3, 4, 6, 8):
                continue
            ids.add(token)

    return classes, ids


def extract_html_ids_and_classes(html_text: str) -> tuple[set[str], set[str]]:
    ids = {m.group(1) for m in re.finditer(r"\bid\s*=\s*\"([^\"]+)\"", html_text)}

    classes: set[str] = set()
    for m in re.finditer(r"\bclass\s*=\s*\"([^\"]+)\"", html_text):
        for cls in re.split(r"\s+", m.group(1).strip()):
            if cls:
                classes.add(cls)

    return ids, classes


def extract_js_ids_and_classes(js_text: str) -> tuple[set[str], set[str]]:
    ids: set[str] = set()
    classes: set[str] = set()

    def add_class_tokens(raw: str) -> None:
        for cls in re.split(r"\s+", raw.strip()):
            if not cls:
                continue
            # Support simple "dynamic BEM" prefixes from template literals.
            # Example: `trophyIcon trophyIcon--${t.id}` -> tokens `trophyIcon` and `trophyIcon--`.
            # We store prefixes as a marker (suffix '*') so run_audit() can treat
            # trophyIcon--anchor / trophyIcon--spark etc as used.
            if cls.endswith("--") or cls.endswith("-"):
                classes.add(f"{cls}*")
            else:
                classes.add(cls)

    # getElementById('foo')
    for m in re.finditer(r"getElementById\(\s*[\"\']([^\"\']+)[\"\']\s*\)", js_text):
        ids.add(m.group(1))

    # querySelector/querySelectorAll('#foo' / '.bar')
    for m in re.finditer(r"querySelector(All)?\(\s*[\"\']([^\"\']+)[\"\']\s*\)", js_text):
        sel = m.group(2)
        for idm in re.finditer(r"#([A-Za-z0-9_-]+)", sel):
            ids.add(idm.group(1))
        for clsm in re.finditer(r"\.([A-Za-z0-9_-]+)", sel):
            classes.add(clsm.group(1))

    # classList.add/remove/toggle/contains('foo')
    for m in re.finditer(r"classList\.(?:add|remove|toggle|contains)\(\s*[\"\']([^\"\']+)[\"\']", js_text):
        classes.add(m.group(1))

    # el.className = 'a b c'
    for m in re.finditer(r"\.className\s*=\s*[\"\']([^\"\']+)[\"\']", js_text):
        add_class_tokens(m.group(1))

    # el.className = `a b ${x} c`
    for m in re.finditer(r"\.className\s*=\s*`([^`]+)`", js_text, flags=re.S):
        templ = m.group(1)
        static = re.sub(r"\$\{[^}]*\}", "", templ)
        add_class_tokens(static)

    # el.setAttribute('class', 'a b c')
    for m in re.finditer(r"setAttribute\(\s*[\"\']class[\"\']\s*,\s*[\"\']([^\"\']+)[\"\']\s*\)", js_text):
        add_class_tokens(m.group(1))

    # el.setAttribute('class', `a b ${x} c`)
    for m in re.finditer(r"setAttribute\(\s*[\"\']class[\"\']\s*,\s*`([^`]+)`\s*\)", js_text, flags=re.S):
        templ = m.group(1)
        static = re.sub(r"\$\{[^}]*\}", "", templ)
        add_class_tokens(static)

    # Capture ids/classes embedded in markup strings (innerHTML/template strings).
    for m in re.finditer(r"\bclass\s*=\s*[\"\']([^\"\']+)[\"\']", js_text):
        for cls in re.split(r"\s+", m.group(1).strip()):
            if cls:
                classes.add(cls)

    for m in re.finditer(r"\bid\s*=\s*[\"\']([^\"\']+)[\"\']", js_text):
        ids.add(m.group(1))

    return ids, classes


@dataclass(frozen=True)
class AuditResults:
    used_ids_html: set[str]
    used_classes_html: set[str]
    used_ids_js: set[str]
    used_classes_js: set[str]
    css_ids: set[str]
    css_classes: set[str]
    unused_css_ids: list[str]
    unused_css_classes: list[str]
    dup_class_tokens: list[str]
    dup_id_tokens: list[str]
    class_sources: dict[str, list[str]]
    id_sources: dict[str, list[str]]


def run_audit() -> AuditResults:
    used_ids_html: set[str] = set()
    used_classes_html: set[str] = set()

    for p in HTML_FILES:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        ids, classes = extract_html_ids_and_classes(txt)
        used_ids_html |= ids
        used_classes_html |= classes

    used_ids_js: set[str] = set()
    used_classes_js: set[str] = set()

    for p in JS_FILES:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        ids, classes = extract_js_ids_and_classes(txt)
        used_ids_js |= ids
        used_classes_js |= classes

    css_ids: set[str] = set()
    css_classes: set[str] = set()

    class_sources: defaultdict[str, set[str]] = defaultdict(set)
    id_sources: defaultdict[str, set[str]] = defaultdict(set)

    for p in CSS_FILES:
        txt = strip_css_comments(p.read_text(encoding="utf-8", errors="ignore"))
        classes, ids = tokenize_css_classes_and_ids(txt)

        css_classes |= classes
        css_ids |= ids

        for c in classes:
            class_sources[c].add(p.name)
        for i in ids:
            id_sources[i].add(p.name)

    used_ids_all = used_ids_html | used_ids_js
    used_classes_all = used_classes_html | used_classes_js

    # Expand "prefix markers" (e.g. 'trophyIcon--*') into actual CSS class usage.
    prefix_markers = {c[:-1] for c in used_classes_all if c.endswith("*")}
    effective_used_classes = {c for c in used_classes_all if not c.endswith("*")}
    if prefix_markers:
        for cls in css_classes:
            for pref in prefix_markers:
                if cls.startswith(pref):
                    effective_used_classes.add(cls)
                    break

    unused_css_ids = sorted(css_ids - used_ids_all)
    unused_css_classes = sorted(css_classes - effective_used_classes)

    dup_class_tokens = sorted([c for c, s in class_sources.items() if len(s) > 1])
    dup_id_tokens = sorted([i for i, s in id_sources.items() if len(s) > 1])

    class_sources_sorted = {k: sorted(v) for k, v in class_sources.items()}
    id_sources_sorted = {k: sorted(v) for k, v in id_sources.items()}

    return AuditResults(
        used_ids_html=used_ids_html,
        used_classes_html=used_classes_html,
        used_ids_js=used_ids_js,
        used_classes_js=used_classes_js,
        css_ids=css_ids,
        css_classes=css_classes,
        unused_css_ids=unused_css_ids,
        unused_css_classes=unused_css_classes,
        dup_class_tokens=dup_class_tokens,
        dup_id_tokens=dup_id_tokens,
        class_sources=class_sources_sorted,
        id_sources=id_sources_sorted,
    )


def write_report(res: AuditResults, out_path: Path) -> None:
    CAP_UNUSED = 250
    CAP_DUPS = 200

    lines: list[str] = []
    lines.append("# CSS Audit Report\n")
    lines.append("\n")
    lines.append("This report is generated by a simple token scan (not a full CSS parser).\n")
    lines.append("Treat results as candidates, not guaranteed safe deletions.\n")
    lines.append("\n")

    lines.append("## Summary\n")
    lines.append(f"- HTML ids: {len(res.used_ids_html)}\n")
    lines.append(f"- HTML classes: {len(res.used_classes_html)}\n")
    lines.append(f"- JS ids: {len(res.used_ids_js)}\n")
    lines.append(f"- JS classes: {len(res.used_classes_js)}\n")
    lines.append(f"- CSS ids: {len(res.css_ids)}\n")
    lines.append(f"- CSS classes: {len(res.css_classes)}\n")
    lines.append(f"- Unused CSS ids (candidate): {len(res.unused_css_ids)}\n")
    lines.append(f"- Unused CSS classes (candidate): {len(res.unused_css_classes)}\n")
    lines.append(f"- Duplicate class tokens across CSS modules: {len(res.dup_class_tokens)}\n")
    lines.append(f"- Duplicate id tokens across CSS modules: {len(res.dup_id_tokens)}\n")

    def section(title: str, items: list[str], cap: int) -> None:
        lines.append("\n")
        lines.append(f"## {title} (showing up to {cap})\n")
        for x in items[:cap]:
            lines.append(f"- {x}\n")
        if len(items) > cap:
            lines.append(f"- ... (+{len(items) - cap} more)\n")

    section("Unused CSS class tokens (candidate)", res.unused_css_classes, CAP_UNUSED)
    section("Unused CSS id tokens (candidate)", res.unused_css_ids, CAP_UNUSED)

    lines.append("\n")
    lines.append("## Duplicate tokens across modules\n")

    lines.append("\n")
    lines.append(f"### Duplicate class tokens (showing up to {CAP_DUPS})\n")
    for x in res.dup_class_tokens[:CAP_DUPS]:
        lines.append(f"- {x}  ({', '.join(res.class_sources.get(x, []))})\n")
    if len(res.dup_class_tokens) > CAP_DUPS:
        lines.append(f"- ... (+{len(res.dup_class_tokens) - CAP_DUPS} more)\n")

    lines.append("\n")
    lines.append(f"### Duplicate id tokens (showing up to {CAP_DUPS})\n")
    for x in res.dup_id_tokens[:CAP_DUPS]:
        lines.append(f"- {x}  ({', '.join(res.id_sources.get(x, []))})\n")
    if len(res.dup_id_tokens) > CAP_DUPS:
        lines.append(f"- ... (+{len(res.dup_id_tokens) - CAP_DUPS} more)\n")

    out_path.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    res = run_audit()
    out = ROOT / "tools" / "css_audit_report.md"
    write_report(res, out)

    print("Wrote", out)
    print(
        "Counts:",
        {
            "html_ids": len(res.used_ids_html),
            "html_classes": len(res.used_classes_html),
            "js_ids": len(res.used_ids_js),
            "js_classes": len(res.used_classes_js),
            "css_ids": len(res.css_ids),
            "css_classes": len(res.css_classes),
            "unused_css_ids": len(res.unused_css_ids),
            "unused_css_classes": len(res.unused_css_classes),
            "dup_class_tokens": len(res.dup_class_tokens),
            "dup_id_tokens": len(res.dup_id_tokens),
        },
    )


if __name__ == "__main__":
    main()
