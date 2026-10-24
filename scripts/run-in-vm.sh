#!/usr/bin/env bash
set -euo pipefail
recipe="$1"
run_id="$2"
[[ "$recipe" =~ ^[a-z0-9-]+$ && "$run_id" =~ ^vm-[A-Za-z0-9-]+$ ]] || exit 2
project_root="$(cd "$(dirname "$0")/.." && pwd)"
artifact_root="/home/vagrant/dependabot-repro/artifacts"
output="$artifact_root/$run_id"
mkdir -p "$artifact_root"
cd "$project_root"
build_log="$artifact_root/$run_id-build.log"
if ! docker build --progress=plain -f .devcontainer/Dockerfile -t dependabot-repro:local . 2>&1 | tee "$build_log"; then
    python3 - "$output" <<'PY'
from pathlib import Path
import sys
import repro
output = Path(sys.argv[1])
output.mkdir()
repro.finish(output, {"status": "blocked", "reason": "Container build failed; inspect build.log."})
PY
    cp "$build_log" "$output/build.log"
    exit 2
fi
image_id="$(docker image inspect dependabot-repro:local --format '{{.Id}}')"
set +e
docker run --rm --network none --memory 4g --cpus 2 --pids-limit 256 \
    --env "REPRO_IMAGE_ID=$image_id" \
    --mount "type=bind,src=$artifact_root,dst=/artifacts" \
    dependabot-repro:local python3 repro.py run "$recipe" --output "/artifacts/$run_id"
run_exit=$?
set -e
if [[ -d "$output" ]]; then
    # The container creates this directory as root. Let the VM user add
    # build metadata while the evidence files remain readable as written.
    sudo -n chown "$(id -u):$(id -g)" "$output"
    cp "$build_log" "$output/build.log"
    printf '%s\n' "$image_id" > "$output/image-id.txt"
fi
exit "$run_exit"
