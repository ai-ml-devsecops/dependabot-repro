#!/usr/bin/env bash
# Run one editable Core checkout using the installed development environment.
set -euo pipefail
# Keep a long-running invocation stable if this wrapper is uploaded again.
if [[ ${CORE_RUNNER_SNAPSHOT:-0} != 1 ]]; then
  snapshot=$(mktemp "${TMPDIR:-/tmp}/core-16622.XXXXXX")
  trap 'rm -f "$snapshot"' EXIT
  cp "${BASH_SOURCE[0]}" "$snapshot"
  if CORE_RUNNER_SNAPSHOT=1 bash "$snapshot" "$@"; then status=0; else status=$?; fi
  exit "$status"
fi
# Accept the old work prefix while existing terminals transition to one checkout.
if [[ ${1:-} == work ]]; then shift; fi
mode=${1:-shell}
if (( $# )); then shift; fi
case "$mode" in dry-run|regression|specs|suite|shell) ;; *) echo 'Use dry-run, regression, specs, suite, or shell' >&2; exit 2 ;; esac
checkout=${CORE_CHECKOUT:-$HOME/dependabot-core-16622-work}
fixture=${REAL_REGISTRY_WORK:-$HOME/16622-real-registry}
image=${CORE_IMAGE:-dependabot/dependabot-core-development-terraform}
image_id=$(docker image inspect --format '{{.Id}}' "$image")
test -d "$checkout/terraform/lib"
test -f "$fixture/tls/localhost.crt"
output="$fixture/evidence/core-$mode-$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p "$output" "$checkout/dry-run" "$checkout/tmp"
git -C "$checkout" rev-parse HEAD > "$output/core-sha.txt"
git -C "$checkout" status --short > "$output/source-status.txt"
git -C "$checkout" diff --binary > "$output/source.diff"
(cd "$checkout"; git ls-files -m -o --exclude-standard -z | tar --null -T - -czf "$output/edited-files.tgz")
printf '%s\n' "$image_id" > "$output/image-id.txt"
args=(--rm --network host --memory 4g --cpus 2 --pids-limit 256
  -e BUNDLE_GEMFILE=/home/dependabot/dependabot-updater/Gemfile
  -e DEPENDABOT_TEST_ACCESS_TOKEN -e LOCAL_GITHUB_ACCESS_TOKEN
  -e 'LOCAL_CONFIG_VARIABLES=[{"type":"terraform_registry","host":"localhost","token":"fixture-only"}]'
  -v "$fixture/tls/localhost.crt:/fixture/localhost.crt:ro"
  -v "$checkout/bin:/home/dependabot/bin"
  -v "$checkout/tmp:/home/dependabot/tmp"
  -v "$checkout/dry-run:/home/dependabot/dry-run"
  -w /home/dependabot)
# Keep the image's installed vendor bundle and Bundler configuration visible.
for part in bin lib spec Gemfile Gemfile.lock; do
  args+=(-v "$checkout/updater/$part:/home/dependabot/dependabot-updater/$part")
done
# Mount the complete ecosystem source and specs, including personal edits.
# Native helper binaries remain those installed in the image under /opt.
for dir in "$checkout"/*; do
  test -d "$dir" || continue
  compgen -G "$dir/*.gemspec" >/dev/null || continue
  args+=(-v "$dir:/home/dependabot/$(basename "$dir")")
done
for config in .rubocop.yml .rubocop_todo.yml .ruby-version; do
  args+=(-v "$checkout/$config:/home/dependabot/$config:ro")
done
case "$mode" in
  dry-run)
    command=(ruby bin/dry-run.rb terraform ai-ml-devsecops/dependabot-repro
      --commit 6fdf4bd9b9f70145901c8f95c73486467580c17a --dir /cases/terraform/16622) ;;
  regression)
    command=(bash -c 'cd terraform; exec bundle exec rspec spec/dependabot/terraform/file_parser_spec.rb spec/dependabot/terraform/file_updater_spec.rb --example "private registry modules with mixed case" --example "module declared with different case"') ;;
  specs)
    command=(bash -c 'cd terraform; exec bundle exec rspec "$@"' --)
    if (( $# )); then command+=("$@"); else
      command+=(spec/dependabot/terraform/file_parser_spec.rb spec/dependabot/terraform/file_updater_spec.rb)
    fi ;;
  suite)
    command=(bash -c 'cd terraform; exec env CI=true RAISE_ON_WARNINGS=true SUITE_NAME=terraform ./script/ci-test') ;;
  shell)
    command=(bash)
    if [[ -t 0 ]]; then args+=(-it); else args+=(-i); fi ;;
esac
printf 'Core: %s\nMode: %s\nEvidence: %s\n' "$checkout" "$mode" "$output"
# The same local registry CA is added automatically on every fresh container.
bootstrap='set -e; cat /etc/ssl/certs/ca-certificates.crt /fixture/localhost.crt > /tmp/fixture-ca.pem; export SSL_CERT_FILE=/tmp/fixture-ca.pem GIT_SSL_CAINFO=/tmp/fixture-ca.pem; exec "$@"'
set +e
if [[ "$mode" == shell ]]; then
  docker run "${args[@]}" "$image_id" bash -c "$bootstrap" -- "${command[@]}"
  status=$?
else
  docker run "${args[@]}" "$image_id" bash -c "$bootstrap" -- "${command[@]}" 2>&1 | tee "$output/run.log"
  status=${PIPESTATUS[0]}
fi
set -e
printf '%s\n' "$status" > "$output/exit-code.txt"
printf '\nExit code: %s; evidence: %s\n' "$status" "$output"
exit "$status"
