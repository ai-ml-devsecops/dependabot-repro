# Terraform #16622: uppercase private registry modules

Tests [#16622](https://github.com/dependabot/dependabot-core/issues/16622) using unmodified Dependabot Core `v0.401.0` and a simulated private registry. Calls Core's Terraform parser and update checker.

Select **Terraform #16622** when creating the codespace. After the build, run these commands from the repository root:

```bash
node repro.mjs --issue 16622 --output result
cat result/result.json
cat result/requests.json
```

Expected result: `"status": "reproduced"`.

For actual boring-registry and a full Core dry run in GitHub Codespaces, follow
[the real-registry instructions](real-registry/README.md).

For another run, use a new output folder, such as `--output result-2`. Delete output folders when you no longer need them. If the result is `blocked`, check `result/run.log` and `result/checker.json` (if present).

## Optional: compare before and after #14434

For each revision below:

1. Set `dependabot_sha` in this folder's `case.json` to that revision.
2. Rebuild the codespace container to install that revision and its dependencies.
3. Run the commands above, replacing `result` with `result-before` or `result-after` in all three commands.

| Revision | Expected result for this fixture |
| --- | --- |
| Before: `e7f8e83e5fc5517fdd7d14311e992f212fd3dccf` | `not_reproduced`: uppercase request and latest version `1.1.0` |
| After: `552ed62b0657ac329de1aff7e5f4625b36e84a71` | `reproduced`: lowercase request and missing-`versions` `KeyError` |

Compare `requests.json` and `checker.json` in both folders. Setup failures are `blocked`. These historical revisions have not been rerun with the Node.js version of this case.
