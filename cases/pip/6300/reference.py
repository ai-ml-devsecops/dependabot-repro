"""Validate the issue's PEP 440 ordering using Python's packaging library."""
import json
import sys
from packaging.version import Version

data = json.load(open(sys.argv[1], encoding="utf-8"))
versions = data["ordered_versions"]
assert len(versions) == 20 and len(set(versions)) == 20
assert sorted(versions, key=Version) == versions
assert data["caret_requirement"] == "^8.0.3.0.1"
Version(data["caret_requirement"][1:])
json.dump({"valid": True, "ordered_versions": versions}, open(sys.argv[2], "w", encoding="utf-8"), indent=2)
