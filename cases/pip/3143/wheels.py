"""Create dependency-free package fixtures for offline pip-compile updates."""
from pathlib import Path
from zipfile import ZipFile
import sys

output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
for version in ("1.0.0", "2.0.0", "3.0.0"):
    metadata = f"repro_demo-{version}.dist-info"
    with ZipFile(output / f"repro_demo-{version}-py3-none-any.whl", "w") as wheel:
        wheel.writestr("repro_demo/__init__.py", f'__version__ = "{version}"\n')
        wheel.writestr(f"{metadata}/METADATA", f"Metadata-Version: 2.1\nName: repro-demo\nVersion: {version}\n")
        wheel.writestr(f"{metadata}/WHEEL", "Wheel-Version: 1.0\nGenerator: dependabot-repro\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
        wheel.writestr(f"{metadata}/RECORD", "")
