# Real boring-registry and full Core dry run

This is the real-registry counterpart of the simulated component reproduction
in the parent folder. It runs boring-registry v0.19.0, publishes `acme/RDS/aws`
versions `1.0.0` and `1.1.0` through its CLI, and invokes unmodified Core
`bin/dry-run.rb`. Core clones the public fixture repository, fetches its
Terraform files, parses them, and checks the real registry.

Validated in the Vagrant VMware VM on 2026-10-26:

- Uppercase lookup: HTTP 200 with both published versions.
- Lowercase lookup: HTTP 200 with `{"modules":[{}]}`.
- Lookup without the fixture token: HTTP 401.
- Full Core dry run: sends the lowercase request, receives HTTP 200, and exits
  `1` with `KeyError: key not found: "versions"`.

The expected exception prevents file updating. This is a full dry-run invocation
that reproduces the failure, not a successful module update. It does not test
the reporter's deployed instance, the regression boundary, or PR #16628.

## Pins and execution

Core v0.401.0: `7683222c5d538d4125b170ddfb85a4e3663fb8b7`.
Public fixture: `ai-ml-devsecops/dependabot-repro` at
`6fdf4bd9b9f70145901c8f95c73486467580c17a`, directory
`/cases/terraform/16622`. Its source is `localhost/acme/RDS/aws`.

`setup.sh` pins boring-registry and the SeaweedFS S3 backend by image digest.
The S3 service is on a dedicated Docker network without published ports.
Only the registry is published, at the VM's `127.0.0.1:443`. Core's container
uses the VM's host network to reach that address. All service credentials are
disposable fixture constants, not account credentials. No GitHub token was
needed for this public fixture.

TLS verification stays enabled. A local seven-day certificate covers
`localhost`; the Core container adds it to its existing CA bundle. The registry
runs under the guest user's UID so it can read the key with its original
restricted permissions.

The Dockerfile adds the full locked gem bundle to the existing component image.
`run-inside.sh` checks the Core SHA and clean tracked source, then uses Core's
explicit `ALLOW_DRY_RUN_STANDALONE=true` option. No parser, registry client,
checker, or dry-run source is patched.

## Run in the VMware VM

From the repository root in **Windows PowerShell**:

```powershell
vagrant up dependabot-repro --provider vmware_desktop
New-Item -ItemType Directory -Force result-real-registry | Out-Null
tar -cf result-real-registry/source.tar Vagrantfile cases/terraform/16622
vagrant upload result-real-registry/source.tar /tmp/16622-real-source.tar dependabot-repro
vagrant ssh dependabot-repro
```

Inside the **VM's Bash shell**:

```bash
mkdir -p /home/vagrant/16622-real-registry/source
tar -xf /tmp/16622-real-source.tar -C /home/vagrant/16622-real-registry/source
cd /home/vagrant/16622-real-registry/source
bash cases/terraform/16622/real-registry/setup.sh
docker build --progress plain --network host -f cases/terraform/16622/Dockerfile -t dependabot-repro:16622-full .
docker build --progress plain --network host -f cases/terraform/16622/real-registry/Dockerfile -t dependabot-repro:16622-dry-run .
bash cases/terraform/16622/real-registry/dry-run.sh
```

The final command should return `1` for the reported failure. Inspect
`/home/vagrant/16622-real-registry/evidence/dry-run.log` rather than treating
any nonzero exit as reproduction. Results are overwritten on a repeat run.

## Collect and verify

Exit to **Windows PowerShell**, then run from the repository root:

```powershell
vagrant ssh dependabot-repro -c 'tar -czf /tmp/16622-evidence.tgz -C /home/vagrant/16622-real-registry evidence'
$evidenceBase64 = & vagrant ssh dependabot-repro -c 'base64 /tmp/16622-evidence.tgz'
if ($LASTEXITCODE -ne 0) { throw 'Evidence download failed' }
[IO.File]::WriteAllBytes((Join-Path (Get-Location) 'result-real-registry/evidence.tgz'), [Convert]::FromBase64String(($evidenceBase64 -join '')))
tar -xzf result-real-registry/evidence.tgz -C result-real-registry
node cases/terraform/16622/real-registry/verify.mjs result-real-registry/evidence
```

The verifier requires both control responses, authentication, pinned real
registry image, live clone/checkout, parsed dependency, lowercase request,
HTTP 200 response, target exception, and matching registry events during the
dry run. It writes `result.json` with each check and the Core image ID.

Raw evidence includes registry responses and headers, registry logs, the full
dry-run log and exit code, timestamps, and Docker image/container metadata.
`result*/` is ignored by Git.

After testing, stop the fixture services from the VM:

```bash
docker stop issue16622-registry issue16622-storage
```

Running `setup.sh` starts them again. Removing the storage container discards
its fixture data. Regenerate the TLS fixture and recreate the registry
container when the seven-day certificate expires.
