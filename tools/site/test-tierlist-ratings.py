"""Check rendered ratings, category coverage, and publish mirrors."""

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/tm-site/src"
CATEGORIES = {"all": None, "corporations": {"corporation"}, "preludes": {"prelude"},
              "projects": {"active", "automated", "event", "project"}, "ceos": {"ceo"}}


def assignment(text, name):
    match = re.search(rf"^const {name} = (.+);$", text, re.MULTILINE)
    if not match:
        raise AssertionError(f"Missing JSON assignment: {name}")
    return json.loads(match[1])


def fingerprint(rows):
    compact = sorted((name, row["score"], row["tier"]) for name, row in rows.items())
    return hashlib.sha256(json.dumps(compact, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


class Cards(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tier = None
        self.rows = {}

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = attrs.get("class", "").split()
        if "tier-row" in classes:
            self.tier = attrs["data-tier"]
        if "card" in classes:
            name = attrs["data-name"]
            assert any(item.startswith("ctype-") for item in classes), f"Missing category identity: {name}"
            if name in self.rows:
                raise AssertionError(f"Duplicate card: {name}")
            self.rows[name] = {"score": int(attrs["data-score"]), "tier": self.tier}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--advisor-root", type=Path)
    args = parser.parse_args()
    manifest_path = ROOT / "apps/tm-site/tierlist-ratings-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    evaluations = json.loads((args.advisor_root / "data/evaluations.json").read_text(encoding="utf-8")) if args.advisor_root else None
    if not evaluations and not manifest:
        raise AssertionError("A pinned manifest or --advisor-root is required")
    all_names = None
    category_counts = {}
    category_tiers = {}
    for category, allowed in CATEGORIES.items():
        expected = {name: row for name, row in evaluations.items()
                    if allowed is None or row["type"] in allowed} if evaluations else None
        for suffix in ("", "_ru"):
            filename = f"tierlist_{category}{suffix}.html"
            text = (SOURCE / "output" / filename).read_text(encoding="utf-8")
            published = (ROOT / "output" / filename).read_text(encoding="utf-8")
            assert text == published, f"Publish mirror differs: {filename}"
            cards = Cards()
            cards.feed(text)
            modal = assignment(text, "cardsData")
            assert set(cards.rows) == set(modal), f"DOM/modal coverage differs: {filename}"
            for name, row in cards.rows.items():
                assert row == {"score": modal[name]["score"], "tier": modal[name]["tier"]}, f"DOM/modal rating differs: {name}"
            if expected is not None:
                missing = set(expected) - set(cards.rows)
                extra = set(cards.rows) - set(expected)
                assert not missing and not extra, f"{filename}: missing={len(missing)}, extra={sorted(extra)}"
                for name, row in cards.rows.items():
                    assert row == {"score": expected[name]["score"], "tier": expected[name]["tier"]}, f"Canonical rating differs: {name}"
            if manifest:
                pin = manifest["categories"][category]
                assert len(cards.rows) == pin["count"], f"Count drift: {filename}"
                assert fingerprint(cards.rows) == pin["scoreTierSha256"], f"Pinned rating drift: {filename}"
            assert "TerraLabs Research" not in modal, f"Stale Terralabs spelling: {filename}"
            if category == "all":
                all_names = set(cards.rows)
            assert all_names is not None and set(cards.rows) <= all_names
            assert set(modal) <= set(assignment(text, "crossPageMap")), f"Missing category links: {filename}"
            category_counts[category] = len(cards.rows)
            category_tiers[category] = {tier: sum(row["tier"] == tier for row in cards.rows.values())
                                        for tier in ("S", "A", "B", "C", "D", "F")}
    landing = (SOURCE / "index.html").read_text(encoding="utf-8")
    assert landing == (ROOT / "index.html").read_text(encoding="utf-8"), "Landing mirror differs"
    stats = assignment(landing, "tierData")
    for identity, category in {"all": "all", "corps": "corporations", "preludes": "preludes",
                               "projects": "projects", "ceos": "ceos"}.items():
        assert stats[identity] == category_tiers[category], f"Landing distribution differs: {category}"
        count = re.search(rf'id="card-{identity}".*?<div class="count" data-ru="(\d+) карт"', landing, re.DOTALL)
        assert count and int(count[1]) == category_counts[category], f"Landing count differs: {category}"
    print(f"Tierlist ratings: 10 pages, {category_counts}, exact score/tier and mirrors passed")


if __name__ == "__main__":
    main()
