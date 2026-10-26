FROM ruby:3.4.8-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates git openssl libgit2-dev cmake pkg-config && rm -rf /var/lib/apt/lists/*
ENV DEPENDABOT_NATIVE_HELPERS_PATH=/opt/helpers BUNDLE_GEMFILE=/opt/dependabot-core/updater/Gemfile
RUN git init /opt/dependabot-core && cd /opt/dependabot-core && git remote add origin https://github.com/dependabot/dependabot-core.git && git fetch --depth=1 origin 7683222c5d538d4125b170ddfb85a4e3663fb8b7 && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = 7683222c5d538d4125b170ddfb85a4e3663fb8b7
WORKDIR /opt/dependabot-core/updater
RUN gem install bundler -v 2.7.2 --no-document && bundle config set --local frozen true && bundle config set --local without test && bundle install && bash ../terraform/helpers/build
WORKDIR /workspaces/dependabot-repro
