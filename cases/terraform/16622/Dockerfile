FROM node:22-bookworm-slim AS node
FROM ruby:3.4.8-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git openssl libgit2-dev cmake pkg-config && rm -rf /var/lib/apt/lists/*
ENV DEPENDABOT_NATIVE_HELPERS_PATH=/opt/helpers BUNDLE_GEMFILE=/opt/dependabot-core/updater/Gemfile
COPY cases/terraform/16622/case.json /tmp/repro-case.json
RUN CORE_SHA=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/repro-case.json')).dependabot_sha") && \
    git init /opt/dependabot-core && cd /opt/dependabot-core && \
    git remote add origin https://github.com/dependabot/dependabot-core.git && \
    git fetch --depth=1 origin "$CORE_SHA" && git checkout --detach FETCH_HEAD && \
    test "$(git rev-parse HEAD)" = "$CORE_SHA"
WORKDIR /opt/dependabot-core/updater
RUN gem install bundler -v 2.7.2 --no-document && bundle config set --local frozen true && bundle config set --local without test && bundle install && bash ../terraform/helpers/build
WORKDIR /workspaces/dependabot-repro
