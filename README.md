# Dependabot #16622 reproduction

Open in GitHub Codespaces, wait for the devcontainer to build, then run `python3 repro.py --output result`.

The proof uses unmodified Dependabot Core `v0.401.0` at `7683222c5d538d4125b170ddfb85a4e3663fb8b7`, a local HTTPS fixture, and real parser/update-checker calls. A `reproduced` status requires the lowercase registry request and the reported `KeyError`. Inspect `result.json`, `requests.json`, `checker.json`, and `run.log` under `result/`.

It does not test a real registry, a proposed fix, a hosted Dependabot job, or PR creation. No token, Vagrant, VM, Docker socket, or network access during the run is needed.
