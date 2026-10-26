# Dependabot issue reproductions

Small, isolated cases that exercise unmodified Dependabot Core and record evidence. The Node.js runner handles execution and results; each case owns its fixtures, ecosystem dependencies, checker, and instructions.

## Codespaces

Choose **Code → Codespaces → ⋯ → New with options**. Select the branch containing these files (`main` once published) and **Terraform #16622** under **Dev container configuration**, then create the codespace and wait for the build.

Each configuration builds only its case's environment. From the repository root:

```bash
node repro.mjs --issue 16622 --output result
cat result/result.json
cat result/requests.json
```

Use a new output directory each time, for example `--output result-2`. Omit `--output` to create a fresh temporary directory and print its path. Output files are disposable; delete them when you no longer need the evidence. No npm install is needed.

GitHub discovers selectable configurations at `.devcontainer/<issue>/devcontainer.json`, which point to each case's build files. The repository opens from the selected branch; only the selected environment is built. See [GitHub's documentation](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers).

## Cases

| Issue | Ecosystem | Instructions |
| --- | --- | --- |
| [#16622](https://github.com/dependabot/dependabot-core/issues/16622) | Terraform | [Uppercase private registry modules](cases/terraform/16622/README.md) |

## Results

| Status | Meaning |
| --- | --- |
| `reproduced` | The specific reported behavior was observed. |
| `not_reproduced` | The relevant operation completed without that behavior, with the case's success evidence. |
| `blocked` | Setup or another failure prevented either conclusion. |

The runner exits `0` for either conclusive status and `2` for a blocked run or invalid invocation. `result.json` records the checker's own exit code separately. A non-reproduction does not establish that an issue is fixed in other environments.

## Layout

- `repro.mjs`: selects a case, creates fresh output, and writes `result.json`.
- `harness/`: shared process execution.
- `cases/<ecosystem>/<issue>/`: issue metadata, environment, fixtures, checker, and instructions.
- `.devcontainer/<issue>/devcontainer.json`: the case's entry in the Codespaces selector.

Keep issue-specific logic inside its case. Export `run({ output, config })` from its `run.mjs`, returning a status and evidence. `case.json` supplies the issue URL and pinned `dependabot_sha`; both the case's build and runner use that pin. Share helpers when multiple cases actually need them. Regression comparisons and proposed-fix validation remain separate checks.

## Local checks

The runner requires Node.js 22 or later, plus the selected case's environment. To check the harness itself:

```bash
node --test
```

The tests cover outcome classification, process execution, artifact handling, and the local HTTPS fixture. HTTPS tests require OpenSSL; set `OPENSSL_BIN` if it is not on your PATH. These checks do not replace running Core in the selected container.
