#!/usr/bin/env bash
set -euo pipefail
work=${REAL_REGISTRY_WORK:-/home/vagrant/16622-real-registry}
mkdir -p "$work/evidence"
image=dependabot-repro:16622-dry-run
docker image inspect "$image" > "$work/evidence/core-image.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$work/evidence/dry-run-started.txt"
set +e
docker run --rm --name issue16622-dry-run --network host \
  --memory 4g --cpus 2 --pids-limit 256 \
  -v "$work/tls/localhost.crt:/fixture/localhost.crt:ro" \
  -v "$work/source/cases/terraform/16622/real-registry/run-inside.sh:/fixture/run-inside.sh:ro" \
  -e ALLOW_DRY_RUN_STANDALONE=true \
  -e 'LOCAL_CONFIG_VARIABLES=[{"type":"terraform_registry","host":"localhost","token":"fixture-only"}]' \
  "$image" bash /fixture/run-inside.sh 2>&1 | tee "$work/evidence/dry-run.log"
status=${PIPESTATUS[0]}
set -e
printf '%s\n' "$status" > "$work/evidence/dry-run-exit-code.txt"
docker logs issue16622-registry > "$work/evidence/registry.log" 2>&1
printf '\nCore dry-run exit code: %s; evidence: %s/evidence\n' "$status" "$work"
exit "$status"
