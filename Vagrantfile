# frozen_string_literal: true

Vagrant.configure("2") do |config|
  config.vm.define "dependabot-repro", primary: true
  config.vm.box = "bento/ubuntu-22.04"
  config.vm.box_version = "202510.26.0"
  config.vm.box_check_update = false
  config.vm.hostname = "dependabot-repro"
  config.vm.boot_timeout = 600
  config.vm.synced_folder ".", "/vagrant", disabled: true
  config.ssh.insert_key = true

  config.vm.provider "vmware_desktop" do |vmware|
    vmware.memory = 8192
    vmware.cpus = 4
    vmware.linked_clone = true
    vmware.gui = false
    vmware.vmx["displayName"] = "dependabot-repro"
  end

  config.vm.provision "shell", inline: <<-SHELL
    set -eu
    export DEBIAN_FRONTEND=noninteractive
    if [ "$(vgs --noheadings -o vg_free_count ubuntu-vg | tr -d '[:space:]')" -gt 0 ]; then
      lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
    fi
    for attempt in 1 2 3 4 5; do
      if apt-get -o Acquire::Retries=3 update; then
        break
      fi
      if [ "$attempt" -eq 5 ]; then
        echo "Ubuntu package index update failed after five attempts" >&2
        exit 1
      fi
      sleep 15
    done
    apt-get -o Acquire::Retries=3 install -y ca-certificates docker.io docker-buildx git
    systemctl enable --now docker
    usermod -aG docker vagrant
  SHELL
end
