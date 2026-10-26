# dependabot-repro

Standalone Ubuntu VM for Dependabot investigations, managed from this repository.

Requires Vagrant and a configured VMware Desktop provider. The VM uses 8 GiB RAM
and four CPUs. Provisioning installs Git, Docker, and Docker Buildx.

From the repository root in PowerShell:

~~~powershell
vagrant up dependabot-repro --provider=vmware_desktop
vagrant ssh dependabot-repro
~~~

The first `up` creates and provisions the VM. Later runs reuse it.
The Vagrant machine name, Ubuntu hostname, and VMware display name are
`dependabot-repro`.

Manage the VM from the same directory:

~~~powershell
vagrant status
vagrant suspend dependabot-repro
vagrant halt dependabot-repro
~~~

Local VM state and virtual disks are stored in `.vagrant/`, which is ignored by Git.
