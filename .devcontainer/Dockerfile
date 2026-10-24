FROM ruby:4.0.5-bookworm

# The source and frozen gem lock are upstream, without a proposed fix.
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates curl git openssl libgit2-dev cmake pkg-config && rm -rf /var/lib/apt/lists/*
ENV DEPENDABOT_NATIVE_HELPERS_PATH=/opt/helpers
RUN git init /opt/dependabot-core && cd /opt/dependabot-core && \
    git remote add origin https://github.com/dependabot/dependabot-core.git && \
    git fetch --depth=1 origin 0616924ebbae8be6ba77ef1565950d88efb5f6a8 && \
    git checkout --detach FETCH_HEAD && \
    test "$(git rev-parse HEAD)" = 0616924ebbae8be6ba77ef1565950d88efb5f6a8
WORKDIR /opt/dependabot-core/updater
RUN gem install bundler -v 4.0.14 --no-document && \
    bundle config set --local frozen true && \
    bundle config set --local without test && bundle install && \
    bash ../terraform/helpers/build
ENV BUNDLE_GEMFILE=/opt/dependabot-core/updater/Gemfile
COPY repro.py /opt/dependabot-repro/repro.py
COPY recipes /opt/dependabot-repro/recipes
COPY examples /opt/dependabot-repro/examples
COPY tests /opt/dependabot-repro/tests
WORKDIR /opt/dependabot-repro
CMD ["python3", "repro.py", "run", "terraform-private-registry-module-case"]
