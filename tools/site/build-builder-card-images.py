"""Build lightweight, consistently sized card images for the tier list builder."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
ASSETS_PATH = ROOT / "apps" / "tm-site" / "src" / "tierlist-builder-assets.js"
SOURCE_OVERRIDE_DIR = ROOT / "tools" / "site" / "builder_card_sources"
OUTPUT_DIR = ROOT / "output" / "builder_cards"
TARGET_SIZE = (480, 640)
WEBP_QUALITY = 96


def load_assets() -> dict:
    text = ASSETS_PATH.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\{[\s\S]*\});?\s*$", text)
    if not match:
        raise ValueError(f"Could not parse {ASSETS_PATH}")
    return json.loads(match.group(1))


def write_assets(payload: dict) -> None:
    ASSETS_PATH.write_text(
        f"window.TM_BUILDER_ASSETS = {json.dumps(payload, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )


def safe_output_name(card_name: str) -> str:
    digest = hashlib.sha1(card_name.encode("utf-8")).hexdigest()[:10]
    return f"{digest}.webp"


def safe_source_override_name(card_name: str) -> str:
    digest = hashlib.sha1(card_name.encode("utf-8")).hexdigest()[:10]
    return f"{digest}.png"


def background_trim_box(image: Image.Image) -> tuple[int, int, int, int]:
    image = image.convert("RGB")
    width, height = image.size
    corners = [
        image.getpixel((0, 0)),
        image.getpixel((width - 1, 0)),
        image.getpixel((0, height - 1)),
        image.getpixel((width - 1, height - 1)),
    ]
    background = tuple(round(sum(pixel[channel] for pixel in corners) / 4) for channel in range(3))
    diff = ImageChops.difference(image, Image.new("RGB", image.size, background))
    red, green, blue = diff.split()
    max_diff = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    mask = max_diff.point(lambda value: 255 if value > 14 else 0)
    return mask.getbbox() or (0, 0, width, height)


def build_image(source: Path, target: Path) -> tuple[int, int]:
    with Image.open(source) as image:
        image = image.convert("RGB")
        image = image.crop(background_trim_box(image))
        image = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=70, threshold=3))
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=WEBP_QUALITY, method=6)
        return image.size


def main() -> None:
    payload = load_assets()
    original_map = payload.get("originalCardImages") or payload.get("cardImages") or {}
    if not original_map:
        raise ValueError("No card image map found")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    thumb_map: dict[str, str] = {}
    missing: list[str] = []
    for card_name, source_rel in sorted(original_map.items()):
        source_override = SOURCE_OVERRIDE_DIR / safe_source_override_name(card_name)
        source = source_override if source_override.exists() else ROOT / source_rel
        if not source.exists():
            missing.append(card_name)
            continue
        filename = safe_output_name(card_name)
        target = OUTPUT_DIR / filename
        build_image(source, target)
        thumb_map[card_name] = f"output/builder_cards/{filename}"

    payload["originalCardImages"] = original_map
    payload["cardImages"] = thumb_map
    payload.pop("cardImageSizes", None)
    payload["builderImageSize"] = {"width": TARGET_SIZE[0], "height": TARGET_SIZE[1], "mode": "uniform-3x4"}
    payload["builderImageVersion"] = f"uniform-3x4-{TARGET_SIZE[0]}x{TARGET_SIZE[1]}-q{WEBP_QUALITY}-corpdom"
    payload["stats"] = {
        **payload.get("stats", {}),
        "builderImages": len(thumb_map),
        "builderImageMissing": len(missing),
    }
    payload["builderImageMissing"] = missing
    write_assets(payload)
    print(
        f"builder card images: {len(thumb_map)}/{len(original_map)} generated "
        f"at {TARGET_SIZE[0]}x{TARGET_SIZE[1]}"
    )
    if missing:
        print("missing:", ", ".join(missing))


if __name__ == "__main__":
    main()
