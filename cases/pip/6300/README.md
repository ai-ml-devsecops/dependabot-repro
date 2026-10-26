# Python #6300: version ordering and caret requirements

Checks [#6300](https://github.com/dependabot/dependabot-core/issues/6300) using Dependabot Core `v0.401.0`, including the `^8.0.3.0.1` example in [this comment](https://github.com/dependabot/dependabot-core/issues/6300#issuecomment-2650334949).

Open the **Python #6300** devcontainer. After the build, run from the repository root:

```bash
node repro.mjs --issue 6300 --output result
cat result/result.json
cat result/checker.json
```

Expected: `reproduced`. The listed ordering passes; the caret example raises `Illformed requirement ["< 9.0.0.dev.0.0"]`.

Use a new output folder for each run. If the result is `blocked`, check `result/run.log` and `result/checker.json` (if present).
