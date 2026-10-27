#!/usr/bin/env bash
# Run inside the Docker-capable Linux VM, from the uploaded repository root.
set -euo pipefail
work=${REAL_REGISTRY_WORK:-/home/vagrant/16622-real-registry}
mkdir -p "$work"/{evidence,tls,module}
exec > >(tee -a "$work/evidence/setup.log") 2>&1
registry=ghcr.io/boring-registry/boring-registry:v0.19.0@sha256:1286b2c3630cbaaebbd911ce1346b586fe7f77d10f38eb05607c730b308157ef
storage=ghcr.io/chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8
for image in "$registry" "$storage"; do docker pull "$image"; done
docker image inspect "$registry" "$storage" > "$work/evidence/images.json"
docker network inspect issue16622-real >/dev/null 2>&1 || docker network create issue16622-real
if [ ! -f "$work/tls/localhost.crt" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 7 \
    -keyout "$work/tls/localhost.key" -out "$work/tls/localhost.crt" \
    -subj /CN=localhost -addext 'subjectAltName=DNS:localhost' \
    -addext 'basicConstraints=critical,CA:TRUE'
fi
# All credentials in this isolated fixture are intentionally disposable constants.
if ! docker container inspect issue16622-storage >/dev/null 2>&1; then
  docker run -d --name issue16622-storage --network issue16622-real \
    -e AWS_ACCESS_KEY_ID=fixture-storage -e AWS_SECRET_ACCESS_KEY=fixture-storage-only \
    "$storage" mini -dir=/data -ip=issue16622-storage -ip.bind=0.0.0.0 -bucket=modules
else
  docker start issue16622-storage >/dev/null
fi
storage_env=(-e AWS_ACCESS_KEY_ID=fixture-storage -e AWS_SECRET_ACCESS_KEY=fixture-storage-only
  -e BORING_REGISTRY_STORAGE_S3_BUCKET=modules
  -e BORING_REGISTRY_STORAGE_S3_REGION=us-east-1
  -e BORING_REGISTRY_STORAGE_S3_PATHSTYLE=true
  -e BORING_REGISTRY_STORAGE_S3_ENDPOINT=http://issue16622-storage:8333)
for version in 1.0.0 1.1.0; do
  cat > "$work/module/boring-registry.hcl" <<EOF
metadata {
  namespace = "acme"
  name = "RDS"
  provider = "aws"
  version = "$version"
}
EOF
  printf 'output "fixture_version" { value = "%s" }\n' "$version" > "$work/module/main.tf"
  ready=false
  for attempt in $(seq 1 30); do
    if docker run --rm --network issue16622-real "${storage_env[@]}" \
      -v "$work/module:/module:ro" "$registry" upload module /module; then
      ready=true; break
    fi
    sleep 2
  done
  test "$ready" = true
done
if ! docker container inspect issue16622-registry >/dev/null 2>&1; then
  docker run -d --name issue16622-registry --network issue16622-real --user "$(id -u):$(id -g)" \
    -p 127.0.0.1:443:5601 "${storage_env[@]}" \
    -v "$work/tls:/tls:ro" "$registry" --json --debug server \
    --auth-static-token=fixture-only --listen-address=:5601 \
    --tls-cert-file=/tls/localhost.crt --tls-key-file=/tls/localhost.key
else
  docker start issue16622-registry >/dev/null
fi
ready=false
for attempt in $(seq 1 30); do
  if curl --silent --show-error --fail --cacert "$work/tls/localhost.crt" \
    https://localhost/.well-known/terraform.json > "$work/evidence/discovery.json"; then
    ready=true; break
  fi
  sleep 2
done
test "$ready" = true
for name in RDS rds; do
  if [ "$name" = RDS ]; then label=uppercase; else label=lowercase; fi
  curl --silent --show-error --cacert "$work/tls/localhost.crt" \
    -H 'Authorization: Bearer fixture-only' \
    -D "$work/evidence/$label.headers" -o "$work/evidence/$label.json" \
    "https://localhost/v1/modules/acme/$name/aws/versions"
  cat "$work/evidence/$label.headers" "$work/evidence/$label.json"
done
curl --silent --show-error --cacert "$work/tls/localhost.crt" \
  -D "$work/evidence/unauthenticated.headers" -o "$work/evidence/unauthenticated.json" \
  https://localhost/v1/modules/acme/RDS/aws/versions
docker logs issue16622-registry > "$work/evidence/registry.log" 2>&1
docker inspect issue16622-registry issue16622-storage > "$work/evidence/containers.json"
printf '\nRegistry evidence: %s/evidence\n' "$work"
