# #16622: Codespaces before/after

Open [this repository in Codespaces](https://codespaces.new/ai-ml-devsecops/dependabot-repro/tree/repro/16622-real-private-registry?devcontainer_path=.devcontainer%2F16622-real-registry%2Fdevcontainer.json), select **Terraform #16622: real registry + full dry run**, and wait for the build.
Run these commands from the repository root in a fresh Codespace.

## 1. Start the registry and build Core's environment

~~~bash
export REAL_REGISTRY_WORK="$PWD/result-real-registry"
docker info
bash cases/terraform/16622/real-registry/setup.sh

docker build --network host -f cases/terraform/16622/Dockerfile \
  -t dependabot-repro:16622-full .
docker build --network host -f cases/terraform/16622/real-registry/Dockerfile \
  -t dependabot-repro:16622-dry-run .

core="$REAL_REGISTRY_WORK/core"
git clone --depth 1 --branch v0.401.0 \
  https://github.com/dependabot/dependabot-core.git "$core"
git -C "$core" rev-parse HEAD
~~~

Core SHA: 7683222c5d538d4125b170ddfb85a4e3663fb8b7. Setup must show both
versions for RDS and {"modules":[{}]} for rds. Keep only uppercase RDS published.

## 2. Define the dry run

~~~bash
run_core() {
  docker run --rm -i --network host --memory 4g --cpus 2 --pids-limit 256 \
    -v "$core/terraform/lib:/opt/dependabot-core/terraform/lib:ro" \
    -v "$core/bin:/opt/dependabot-core/bin:ro" \
    -v "$REAL_REGISTRY_WORK/tls/localhost.crt:/fixture/localhost.crt:ro" \
    -e ALLOW_DRY_RUN_STANDALONE=true \
    -e 'LOCAL_CONFIG_VARIABLES=[{"type":"terraform_registry","host":"localhost","token":"fixture-only"}]' \
    -w /opt/dependabot-core dependabot-repro:16622-dry-run bash -se <<'BASH'
cat /etc/ssl/certs/ca-certificates.crt /fixture/localhost.crt > /tmp/fixture-ca.pem
export SSL_CERT_FILE=/tmp/fixture-ca.pem GIT_SSL_CAINFO=/tmp/fixture-ca.pem
ruby bin/dry-run.rb terraform ai-ml-devsecops/dependabot-repro \
  --commit 6fdf4bd9b9f70145901c8f95c73486467580c17a --dir /cases/terraform/16622
BASH
}
~~~

In a second Codespaces terminal, follow registry requests:

~~~bash
docker logs --tail 0 --timestamps -f issue16622-registry
~~~

## 3. Before

~~~bash
set -o pipefail
run_core 2>&1 | tee "$REAL_REGISTRY_WORK/evidence/before.log"
~~~

Expected: /acme/rds/aws/versions, HTTP 200, missing-versions KeyError, exit 1.

## 4. Apply the PR patch and rerun

~~~bash
pr_base=a08dcadf750c87fdb51c15115b13fdf560423380
pr_head=0348c1fbf348845674af3b280ca29b7ade5ea9b1
git -C "$core" fetch --depth 1 origin "$pr_base" "$pr_head"
git -C "$core" diff --binary "$pr_base" "$pr_head" \
  > "$REAL_REGISTRY_WORK/evidence/pr-16628.diff"
git -C "$core" apply --check "$REAL_REGISTRY_WORK/evidence/pr-16628.diff"
~~~

If the check succeeds:

~~~bash
git -C "$core" apply --index "$REAL_REGISTRY_WORK/evidence/pr-16628.diff"
git -C "$core" --no-pager diff --cached --stat
run_core 2>&1 | tee "$REAL_REGISTRY_WORK/evidence/after.log"
~~~

Expected: /acme/RDS/aws/versions, latest version 1.1.0, successful completion,
exit 0. Registry events should show rds before and RDS after.

This applies [#16628's patch](https://github.com/dependabot/dependabot-core/pull/16628)
to v0.401.0, not the complete PR branch. The ~> 1.0 requirement already permits
1.1.0, so no version-update diff is expected. Scope: one Terraform declaration;
not a full regression or security review. These commands perform no security
scan or dependency audit.

The Docker commands were tested on Linux; this Codespaces configuration has
not been tested in a live Codespace. Push the config/docs before sharing the link.
