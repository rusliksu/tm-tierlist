"""Exercise the actual CLI: exact projection, next release, invalid-input safety."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

writer = Path(__file__).with_name("write-release-date.py")
with tempfile.TemporaryDirectory(prefix="tm-release-date-") as directory:
    root = Path(directory)
    manifest = root / "release-manifest.json"
    compact = root / "release-date.json"

    def run():
        return subprocess.run([sys.executable, str(writer), str(root)], capture_output=True, text=True)

    manifest.write_text(json.dumps({"generated_utc": "2026-10-15T00:15:00+00:00", "files": [
        {"path": "index.html", "sha256": "0" * 64} for _ in range(5000)
    ]}), encoding="utf-8")
    original = manifest.read_bytes()
    result = run()
    assert result.returncode == 0, result.stderr
    assert compact.read_bytes() == b'{"generated_utc":"2026-10-15T00:15:00+00:00"}\n'
    assert manifest.read_bytes() == original, "The full manifest must stay untouched"
    assert compact.stat().st_size < 128 and manifest.stat().st_size > 400_000

    manifest.write_text('{"generated_utc":"2027-01-02T00:15:00Z"}', encoding="utf-8")
    assert run().returncode == 0
    next_release = b'{"generated_utc":"2027-01-02T00:15:00Z"}\n'
    assert compact.read_bytes() == next_release
    for invalid in ['{broken', '{}', '{"generated_utc":null}', '{"generated_utc":123}',
                    '{"generated_utc":"not a date"}', '{"generated_utc":"2026-10-15T00:00:00"}']:
        manifest.write_text(invalid, encoding="utf-8")
        assert run().returncode != 0, invalid
        assert compact.read_bytes() == next_release, "Invalid input must not replace a valid projection"

print("Release-date writer: exact compact projection, unchanged manifest, next release and invalid-input safety PASS")
