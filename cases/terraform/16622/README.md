# Terraform #16622: uppercase private registry modules

Tests [dependabot-core#16622](https://github.com/dependabot/dependabot-core/issues/16622) using unmodified Core `v0.401.0`, pinned by `case.json` to `7683222c5d538d4125b170ddfb85a4e3663fb8b7`.

Create a codespace from the branch containing this case and select **Terraform #16622** under **Dev container configuration**. From the repository root:

```bash
node repro.mjs --issue 16622 --output result
cat result/result.json
cat result/requests.json
```

For an existing codespace using the Python version, select this case's new dev container configuration and rebuild before running. Use a fresh output directory on each run.

## Evidence

The fixture serves a local HTTPS registry with a temporary trusted CA. TLS verification stays enabled. It requires a fixture-only bearer token and returns versions `1.0.0` and `1.1.0` for `acme/RDS/aws`, but HTTP 200 with `{"modules":[{}]}` for `acme/rds/aws`, matching the issue's reported responses.

The Ruby checker uses Core's real Terraform parser, verifies that the uppercase endpoint works through Ruby/Excon, then calls the real update checker.

- `reproduced` requires the actual lowercase request from Dependabot and the missing-`versions` `KeyError` in `all_module_versions`.
- `not_reproduced` requires a successful update check, the actual uppercase request, and discovery of `1.1.0`.
- Everything else is `blocked`.

Inspect `result.json`, `requests.json`, `checker.json`, `run.log`, and the copied `main.tf` in the output directory. `exit_code: 1` is expected for the Ruby checker's target exception; the Node runner exits `0` when the reproduction is conclusive. Output is disposable and is never reused or overwritten.

This tests the failure mechanism against a synthetic registry. It does not test deployed boring-registry, OpenTofu, a full hosted Dependabot job, file updates, PR creation, or a proposed fix. No user token, VM, Vagrant, Docker socket, or external network access is needed during the reproduction; the container build downloads its dependencies.

## Compare revisions separately

Change `dependabot_sha` in this case's `case.json`, rebuild the case's container to install that revision and its dependencies, and run into a new output directory. The Dockerfile and runner read the same pin. Core must remain clean. Compare actual requests and checker evidence across runs; build failures are blocked runs.

Changing only the checkout in a running container is insufficient because its installed dependencies may belong to another revision. Older revisions may also require changes to the case's runtime setup. No historical comparison is performed automatically.
