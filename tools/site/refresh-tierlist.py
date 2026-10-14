"""Import canonical advisor evaluations without replacing the site's UI or sprites."""

import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/tm-site/src"


def assignment(text, name):
    return json.loads(re.search(rf"^const {name} = (.+);$", text, re.MULTILINE)[1])


def fingerprint(rows):
    compact = sorted((name, row["score"], row["tier"]) for name, row in rows.items())
    return hashlib.sha256(json.dumps(compact, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def replace_once(text, pattern, replacement):
    result, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise ValueError(f"Expected one template marker: {pattern}")
    return result


def existing_atlas(config):
    fields = {"path": "path", "sheet_width": "sheetWidth", "sheet_height": "sheetHeight",
              "thumb_width": "thumbWidth", "thumb_height": "thumbHeight",
              "display_thumb_width": "displayThumbWidth", "display_thumb_height": "displayThumbHeight",
              "display_sheet_width": "displaySheetWidth", "display_sheet_height": "displaySheetHeight",
              "source_scale": "sourceScale", "coords": "coords"}
    return {target: config[source] for target, source in fields.items()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--advisor-root", type=Path, required=True)
    args = parser.parse_args()
    advisor = args.advisor_root.resolve()
    generator_path = advisor / "scripts/generate_visual_tierlist.py"
    spec = importlib.util.spec_from_file_location("advisor_tierlist_generator", generator_path)
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    generator.LANG_RU = True
    evaluations, card_index, image_mapping, names_ru = generator.load_data()
    manifest_path = ROOT / "apps/tm-site/tierlist-ratings-manifest.json"
    previous_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    preserved_evidence = previous_manifest["preservedWikiEvidence"]
    builder_assets = (SOURCE / "tierlist-builder-assets.js").read_text(encoding="utf-8")
    metadata = json.loads(re.search(r"=\s*(\{.*\});?\s*$", builder_assets, re.DOTALL)[1]).get("cardMetadata", {})
    # Keep assets already supplied by the site; missing artwork uses its text fallback.
    image_mapping = {name: path for name, path in image_mapping.items() if (ROOT / path).is_file()}
    manifest = {"sourceRepo": "rusliksu/tm-advisor",
                "sourceCommit": subprocess.check_output(["git", "-C", str(advisor), "rev-parse", "HEAD"], text=True).strip(),
                "evaluationsSha256": hashlib.sha256((advisor / "data/evaluations.json").read_bytes()).hexdigest(),
                "sourceSiteCommit": previous_manifest["sourceSiteCommit"],
                "preservedWikiEvidence": preserved_evidence,
                "categories": {}}
    tier_counts = {}
    for category in generator.CARD_TYPES:
        for russian in (False, True):
            generator.LANG_RU = russian
            filename = f"tierlist_{category}{'_ru' if russian else ''}.html"
            output = SOURCE / "output" / filename
            original = output.read_text(encoding="utf-8")
            sprite = assignment(original, "spriteConfig")
            if "TerraLabs Research" in sprite["coords"]:
                sprite["coords"]["Terralabs Research"] = sprite["coords"].pop("TerraLabs Research")
            generator.build_sprite_atlas = lambda *unused: existing_atlas(sprite)
            tiers = generator.get_cards_for_category(category, evaluations, card_index, names_ru)
            for group in tiers.values():
                for card in group:
                    if card["name"] in preserved_evidence:
                        card["wiki_evidence"] = preserved_evidence[card["name"]]
                    # Category identity is known even when the card-facts index is incomplete.
                    if not card["card_type"]:
                        card_type = generator.resolve_card_type(card["name"], evaluations[card["name"]], card_index)
                        card["card_type"] = metadata.get(card["name"], {}).get("type", card_type) if card_type == "project" else card_type
            generated = generator.generate_html(category, tiers, image_mapping,
                                                generator.build_cross_page_map(evaluations, card_index))
            rows_pattern = r'<div class="container">.*?(?=<div class="modal-overlay")'
            rows = re.search(rows_pattern, generated, re.DOTALL).group()
            updated = replace_once(original, rows_pattern, rows)
            for name in ("cardsData", "crossPageMap", "spriteConfig", "modalImagePaths"):
                value = assignment(generated, name)
                updated = replace_once(updated, rf"const {name} = [^\n]+;",
                                       f"const {name} = {json.dumps(value, ensure_ascii=False)};")
            for identity in ("tierFilters", "tagFilters", "expFilters", "mechanicFilters", "roleFilters"):
                pattern = rf'<div class="filter-chips" id="{identity}">.*?</div>'
                filters = re.search(pattern, generated, re.DOTALL).group()
                updated = replace_once(updated, pattern, filters)
            cards = {card["name"]: card for group in tiers.values() for card in group}
            updated = re.sub(r"(— )\d+( (?:(?:cards)|(?:карт)))", rf"\g<1>{len(cards)}\g<2>", updated)
            updated = generator.strip_trailing_whitespace(updated)
            for destination in (output, ROOT / "output" / filename):
                destination.write_text(updated, encoding="utf-8", newline="\n")
            manifest["categories"][category] = {"count": len(cards), "scoreTierSha256": fingerprint(cards)}
            tier_counts[category] = {tier: len(group) for tier, group in tiers.items()}
            print(f"Refreshed {filename}: {len(cards)} cards")

    landing = (SOURCE / "index.html").read_text(encoding="utf-8")
    categories = {"all": "all", "corps": "corporations", "preludes": "preludes", "projects": "projects", "ceos": "ceos"}
    for identity, category in categories.items():
        count = manifest["categories"][category]["count"]
        pattern = rf'(<a class="nav-card" id="card-{identity}".*?<div class="count").*?</div>'
        match = re.search(pattern, landing, re.DOTALL)
        landing = replace_once(landing, pattern, match[1] + f' data-ru="{count} карт" data-en="{count} cards">{count} карт</div>')
    total = manifest["categories"]["all"]["count"]
    landing = re.sub(r"\b\d+( (?:карт оценены|cards rated))", rf"{total}\g<1>", landing)
    for category, labels in (("corporations", "корпораций|corps"), ("preludes", "прелюдий|preludes"),
                             ("projects", "проектных карт|projects"), ("ceos", "CEO|CEOs")):
        count = manifest["categories"][category]["count"]
        landing = re.sub(rf"\b\d+( (?:{labels})\b)", rf"{count}\g<1>", landing)
    for tier, count in tier_counts["all"].items():
        pattern = rf'(<span class="stat-label">{tier}</span>\s*<span class="stat-value">)\d+(</span>)'
        landing = re.sub(pattern, rf"\g<1>{count}\g<2>", landing)
    data = {identity: tier_counts[category] for identity, category in categories.items()}
    landing = replace_once(landing, r"const tierData = \{.*?\};", f"const tierData = {json.dumps(data)};")
    for destination in (SOURCE / "index.html", ROOT / "index.html"):
        destination.write_text(landing, encoding="utf-8", newline="\n")
    (ROOT / "apps/tm-site/tierlist-ratings-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
