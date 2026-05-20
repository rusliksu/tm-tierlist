"""Validate generated tier list builder card assets."""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS_PATH = ROOT / "apps" / "tm-site" / "src" / "tierlist-builder-assets.js"
HTML_PATH = ROOT / "apps" / "tm-site" / "src" / "tierlist-builder.html"
EXPECTED_SIZE = (480, 640)
EXPECTED_MODE = "uniform-3x4"
EXPECTED_VERSION = "uniform-3x4-480x640-q96-corpdom"
REQUIRED_SOURCE_OVERRIDES = ["Polaris", "Ringcom", "Point Luna", "Manutech"]


def load_assets() -> dict:
    text = ASSETS_PATH.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\{[\s\S]*\});?\s*$", text)
    if not match:
        raise AssertionError(f"Could not parse {ASSETS_PATH}")
    return json.loads(match.group(1))


def assert_image_size(path: Path, expected: tuple[int, int], label: str) -> None:
    if not path.exists():
        raise AssertionError(f"{label} does not exist: {path}")
    with Image.open(path) as image:
        if image.size != expected:
            raise AssertionError(f"{label} has size {image.size}, expected {expected}: {path}")


def source_override_name(card_name: str) -> str:
    import hashlib

    return f"{hashlib.sha1(card_name.encode('utf-8')).hexdigest()[:10]}.png"


def main() -> None:
    payload = load_assets()
    card_images = payload.get("cardImages") or {}
    original_images = payload.get("originalCardImages") or {}
    missing = payload.get("builderImageMissing") or []
    size = payload.get("builderImageSize") or {}
    stats = payload.get("stats") or {}

    if missing:
        raise AssertionError(f"builderImageMissing is not empty: {missing}")
    if size.get("width") != EXPECTED_SIZE[0] or size.get("height") != EXPECTED_SIZE[1] or size.get("mode") != EXPECTED_MODE:
        raise AssertionError(f"builderImageSize is {size}, expected {EXPECTED_SIZE} {EXPECTED_MODE}")
    if payload.get("builderImageVersion") != EXPECTED_VERSION:
        raise AssertionError(f"builderImageVersion is {payload.get('builderImageVersion')}, expected {EXPECTED_VERSION}")
    if len(card_images) != stats.get("builderImages"):
        raise AssertionError(f"cardImages count {len(card_images)} != stats.builderImages {stats.get('builderImages')}")
    if len(card_images) != len(original_images):
        raise AssertionError(f"cardImages count {len(card_images)} != originalCardImages count {len(original_images)}")

    for card_name, rel_path in card_images.items():
        assert_image_size(ROOT / rel_path, EXPECTED_SIZE, f"builder image for {card_name}")

    for card_name, rel_path in original_images.items():
        if not (ROOT / rel_path).exists():
            raise AssertionError(f"original image for {card_name} does not exist: {rel_path}")

    for card_name in REQUIRED_SOURCE_OVERRIDES:
        override = ROOT / "tools" / "site" / "builder_card_sources" / source_override_name(card_name)
        if not override.exists():
            raise AssertionError(f"required source override is missing for {card_name}: {override}")
        with Image.open(override) as image:
            if image.width < 480 or image.height < 700:
                raise AssertionError(f"source override for {card_name} looks too small: {image.size}")

    html = HTML_PATH.read_text(encoding="utf-8")
    if "aspect-ratio: 3 / 4;" not in html:
        raise AssertionError("builder HTML must keep .card-art at aspect-ratio: 3 / 4")

    print(
        json.dumps(
            {
                "builderImages": len(card_images),
                "originalImages": len(original_images),
                "sourceOverridesChecked": REQUIRED_SOURCE_OVERRIDES,
                "size": f"{EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}",
                "version": EXPECTED_VERSION,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
