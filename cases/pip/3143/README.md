# pip-tools #3143: changing comment paths

Checks [#3143](https://github.com/dependabot/dependabot-core/issues/3143) using Dependabot Core `v0.401.0`.

Open the **pip-tools #3143** devcontainer. After the build, run from the repository root:

```bash
node repro.mjs --issue 3143 --output result
cat result/result.json
cat result/checker.json
```

Expected: `reproduced`. Comment paths change when updating multiple projects versus one project.

Use a new output folder for each run. If the result is `blocked`, check `result/run.log` and `result/checker.json` (if present).
