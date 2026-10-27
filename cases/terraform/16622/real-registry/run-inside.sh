#!/usr/bin/env bash
set -euo pipefail
cd /opt/dependabot-core
printf 'Core SHA: '; git rev-parse HEAD
test "$(git rev-parse HEAD)" = 7683222c5d538d4125b170ddfb85a4e3663fb8b7
test -z "$(git status --porcelain --untracked-files=no)"
cat /etc/ssl/certs/ca-certificates.crt /fixture/localhost.crt > /tmp/fixture-ca.pem
export SSL_CERT_FILE=/tmp/fixture-ca.pem
export GIT_SSL_CAINFO=/tmp/fixture-ca.pem
printf 'Running unmodified bin/dry-run.rb against public fixture commit 6fdf4bd9b9f70145901c8f95c73486467580c17a\n'
ruby bin/dry-run.rb terraform ai-ml-devsecops/dependabot-repro \
  --commit 6fdf4bd9b9f70145901c8f95c73486467580c17a \
  --dir /cases/terraform/16622
