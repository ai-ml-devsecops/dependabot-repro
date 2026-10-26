FROM node:22-bookworm-slim AS node
FROM ruby:3.4.8-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git libgit2-dev cmake pkg-config python3 python3-venv && rm -rf /var/lib/apt/lists/*
ENV DEPENDABOT_NATIVE_HELPERS_PATH=/opt/helpers BUNDLE_GEMFILE=/opt/dependabot-core/updater/Gemfile
COPY cases/pip/3143/case.json /tmp/repro-case.json
RUN CORE_SHA=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/repro-case.json')).dependabot_sha") && \
    git init /opt/dependabot-core && cd /opt/dependabot-core && \
    git remote add origin https://github.com/dependabot/dependabot-core.git && \
    git fetch --depth=1 origin "$CORE_SHA" && git checkout --detach FETCH_HEAD && \
    test "$(git rev-parse HEAD)" = "$CORE_SHA"
WORKDIR /opt/dependabot-core/updater
RUN gem install bundler -v 2.7.2 --no-document && bundle config set --local frozen true && bundle config set --local without test && bundle install
RUN git init /opt/pyenv && cd /opt/pyenv && \
    git remote add origin https://github.com/pyenv/pyenv.git && \
    git fetch --depth=1 origin 94071a937429c1923e12f8e57bc109aeebe7a0ff && git checkout --detach FETCH_HEAD
ENV PYENV_ROOT=/opt/pyenv PYENV_VERSION=system
ENV PATH=/opt/python-env/bin:/opt/pyenv/bin:$PATH
RUN python3 -m venv /opt/python-env && \
    mkdir -p /opt/helpers && cp -r /opt/dependabot-core/python/helpers /opt/helpers/python && \
    python3 -m pip install --disable-pip-version-check -r /opt/helpers/python/requirements.txt
COPY cases/pip/3143/wheels.py /tmp/repro-wheels.py
RUN python3 /tmp/repro-wheels.py /opt/repro-wheels && mkdir -p /opt/pyenv/versions && ln -s /opt/python-env "/opt/pyenv/versions/$(python3 -c 'import platform; print(platform.python_version())')"
WORKDIR /workspaces/dependabot-repro

