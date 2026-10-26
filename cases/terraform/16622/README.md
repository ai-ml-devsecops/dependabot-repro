# Terraform #16622: uppercase private registry modules

Tests [#16622](https://github.com/dependabot/dependabot-core/issues/16622) using Dependabot Core `v0.401.0` and a simulated private registry.

Select **Terraform #16622** when creating the codespace. After the build, run these commands from the repository root:

```bash
node repro.mjs --issue 16622 --output result
cat result/result.json
cat result/requests.json
```

Expected result: `"status": "reproduced"`.

For another run, use a new output folder, such as `--output result-2`. Delete output folders when you no longer need them. If the result is `blocked`, check `result/run.log` and `result/checker.json` (if present).
