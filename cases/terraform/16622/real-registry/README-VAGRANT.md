# #16622: Vagrant/VMware setup

Optional local VM workflow. Maintainers should use the
[Codespaces instructions](PR-COMPARISON.md).

## Windows PowerShell: start and upload

From the repository root:

~~~powershell
vagrant up dependabot-repro --provider vmware_desktop
New-Item -ItemType Directory -Force result-real-registry | Out-Null
tar -cf result-real-registry/source.tar Vagrantfile cases/terraform/16622
vagrant upload result-real-registry/source.tar /tmp/16622-real-source.tar dependabot-repro
vagrant ssh dependabot-repro
~~~

## VM Bash: registry and original baseline

~~~bash
mkdir -p "$HOME/16622-real-registry/source"
tar -xf /tmp/16622-real-source.tar -C "$HOME/16622-real-registry/source"
cd "$HOME/16622-real-registry/source"
export REAL_REGISTRY_WORK="$HOME/16622-real-registry"
bash cases/terraform/16622/real-registry/setup.sh

docker build --network host -f cases/terraform/16622/Dockerfile \
  -t dependabot-repro:16622-full .
docker build --network host -f cases/terraform/16622/real-registry/Dockerfile \
  -t dependabot-repro:16622-dry-run .
bash cases/terraform/16622/real-registry/dry-run.sh
~~~

Expected exit 1: lowercase request followed by the missing-versions KeyError.
Logs: $REAL_REGISTRY_WORK/evidence/. Certificate/network errors are inconclusive.
The original verify.mjs verifies this baseline failure only.

Stop services when finished:

~~~bash
docker stop issue16622-registry issue16622-storage
~~~
