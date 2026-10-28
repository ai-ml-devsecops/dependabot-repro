FROM mcr.microsoft.com/devcontainers/base:bookworm
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssl \
    && rm -rf /var/lib/apt/lists/*
USER vscode
