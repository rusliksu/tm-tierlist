"""Project the release timestamp into small, public browser metadata."""
import argparse
from datetime import datetime
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release_root", type=Path, help="Prepared, inactive static release directory")
    root = parser.parse_args().release_root
    manifest = json.loads((root / "release-manifest.json").read_text(encoding="utf-8"))
    timestamp = manifest.get("generated_utc")
    if not isinstance(timestamp, str) or datetime.fromisoformat(timestamp).tzinfo is None:
        raise ValueError("generated_utc must be an ISO timestamp with a timezone")
    target = root / "release-date.json"
    if target.is_symlink():
        raise ValueError("Refusing to overwrite a release-date symlink")
    target.write_text(json.dumps({"generated_utc": timestamp}, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
