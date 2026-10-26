# uv #16589: dependencies ignored with build-only Poetry configuration

Checks [#16589](https://github.com/dependabot/dependabot-core/issues/16589) using Core `v0.401.0` and the issue's minimal manifest. A control removes only `[tool.poetry]`.

Select **uv #16589** when creating the codespace. After the build, run from the repository root:

```bash
node repro.mjs --issue 16589 --output result
cat result/result.json
cat result/checker.json
```

- `reproduced`: the control finds `requests`, but the original manifest yields no dependencies.
- `not_reproduced`: both manifests find the declared `requests` dependency.
- `blocked`: the control or another check fails; inspect `result/run.log`.

Use a fresh output folder for each run. This checks manifest parsing; it does not run the reporter's full project, lockfile update, or PR creation.
