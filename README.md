# dependabot-repro

Reproduce reported Dependabot behavior on unmodified, pinned upstream code.
Save the inputs, requests, exception, and a draft reply that a maintainer can inspect.
No model, agent framework, API key, real registry token, or paid service is required.

The first recipe covers Terraform private-registry module names containing uppercase
letters, based on [dependabot-core #16622](https://github.com/dependabot/dependabot-core/issues/16622).
It uses a synthetic HTTPS registry with the responses described in the ticket.
It does not test a proposed fix.

## Test with the existing Windows/Vagrant VM

From this repository in PowerShell:

~~~powershell
.\scripts\Run-InVagrant.ps1
~~~

The default VM configuration directory is the sibling devsec/dependabot-lab folder.
Override it when needed:

~~~powershell
.\scripts\Run-InVagrant.ps1 -VagrantDirectory C:\path\to\existing\dependabot-lab
~~~

The helper resumes the existing VM without provisioning, uploads an allowlist of
project files, builds the container, runs it with external networking disabled,
and downloads evidence into artifacts/vm-... . Initial builds can take several
minutes. Build failure stops execution; an old image is not used.
The helper requires Vagrant, tar, OpenSSH/scp, and the existing VM.
The VM remains running afterward.

Vagrant calls this existing machine "default" because its Vagrantfile does not use
config.vm.define. Its guest hostname is dependabot-core. These names do not
affect reproduction. VM state stays in the original directory; do not copy
.vagrant or rename the registered machine to reuse it.

## Test with Docker on Linux

~~~bash
docker build -f .devcontainer/Dockerfile -t dependabot-repro:local .
mkdir -p artifacts
docker run --rm --network none --memory 4g --cpus 2 --pids-limit 256 \
  --mount type=bind,src="$PWD/artifacts",dst=/artifacts \
  dependabot-repro:local python3 repro.py run terraform-private-registry-module-case --output /artifacts/first-run
cat artifacts/first-run/result.json
~~~

Run the container only after the build succeeds. Use a new output directory for
each run; existing evidence is never overwritten.

## Inspect or edit in a devcontainer

Open this folder with VS Code's Dev Containers extension and choose
Reopen in Container. The same configuration can be used in GitHub Codespaces
after the repository is published. Setup lists recipes; it does not run them.

Inside the container:

~~~bash
python3 repro.py list
python3 repro.py run terraform-private-registry-module-case
~~~

After publishing to ai-ml-devsecops/dependabot-repro, this launch URL becomes usable:
[Open in Codespaces](https://codespaces.new/ai-ml-devsecops/dependabot-repro).
Codespaces requires the user's confirmation and may consume their allowance.
Neither public repository creation nor a Codespaces launch has been performed by
the local setup scripts.

## What counts as a reproduction

The recipe checks:

1. The pinned upstream checkout has no tracked source modifications.
2. The uppercase URL returns versions and the lowercase URL returns the supplied
   response. Python and Ruby both verify HTTPS using a temporary private CA.
3. The real Terraform parser changes acme/RDS/aws to acme/rds/aws.
4. The real Dependabot registry client requests the lowercase versions URL.
5. The update checker raises KeyError for the missing versions key, with the
   registry-client method in the stack.

The HTTP request log labels fixture checks, the Ruby HTTPS control, and actual
Dependabot requests separately. Fixture requests cannot satisfy the reproduction
assertion. The fixture sends TLS close_notify so Ruby/OpenSSL can read a complete
response without the earlier unexpected-EOF failure.

Each run saves result.json, case.json, main.tf, fixture-checks.json, requests.json,
checker.json, run.log, report.md, and comment-draft.md when it reaches those steps.
The VM helper also saves build.log and image-id.txt.
Read the status, not just the process exit code:

| Status | Meaning | Exit |
| --- | --- | --- |
| reproduced | Request and exception evidence match the reported synthetic case. | 0 |
| not_reproduced | The supplied case completed without the reported failure. | 0 |
| blocked | Setup or an unrelated failure prevents a conclusion. | 2 |
| needs_info | Specific inputs required by this recipe are missing. | 3 |
| unsupported | No reviewed recipe applies. | 4 |
| ready | Inputs are sufficient or a recipe is selected; no execution has happened. | 0 |

No status closes an issue or posts a comment.

## Test sparse input and issue intake

These commands use Python's standard library and work on Windows:

~~~powershell
python repro.py assess examples/needs-info.json
python repro.py assess recipes/terraform-private-registry-module-case/case.json
python repro.py inspect https://github.com/dependabot/dependabot-core/issues/16622
python -m unittest discover -s tests -v
~~~

The sparse example creates a draft asking for a minimal manifest and paired,
sanitized registry responses. It does not ask for credentials. The complete case
does not require the reporter's actual registry installation to reproduce the
Core behavior under the supplied responses.

The inspect command snapshots the public issue and comments, then selects from
curated issue mappings. It does not interpret arbitrary reports or run their code.
GitHub's public API can rate-limit unauthenticated requests; that produces blocked.
Unknown issues produce unsupported, not an invented needs_info decision.

To adjust the scenario, edit the recipe's case.json or pass --case path/to/case.json
to the run command inside the container. Keep assumptions explicit.

## Scope and next steps

This is a recipe executor with one reviewed recipe, not a general backlog agent.
Additional recipes can reuse the case assessment, artifact format, and environment.
Their runtime dependencies and execution logic must be implemented and tested;
adding a recipe.json file alone does not add ecosystem support.

An optional model/API adapter could later extract candidate inputs, select recipes,
and draft focused questions. LangGraph or an agents SDK is not needed to execute
or verify this POC. Keep recorded evidence and classification assertions independent
of that adapter.

The real boring-registry deployment, OpenTofu, hosted Dependabot scheduling, and
PR creation are outside this recipe's scope. The upstream source SHA and gem lock
are pinned; the Ruby base image tag and apt packages can change. Retain build logs
and image IDs. Build-time downloads need internet; recipe execution needs only
loopback. No Docker socket, host credentials, or real registry secrets are mounted
into the recipe container.

## Publish after reviewing the files

This local project is intended to be its own public repository. Check the files,
then run these commands from this repository only:

~~~powershell
git add .
git commit -m "Add Terraform private registry reproduction POC"
gh repo create ai-ml-devsecops/dependabot-repro --public --source . --remote origin --push
~~~

Public publication is separate from the local POC. Generated artifacts and SSH
configuration are ignored by Git. Add the published repository or evidence URL
to a generated comment draft before sharing it.
