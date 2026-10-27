FROM dependabot-repro:16622-full
# The component image excludes test/development gems. The full dry-run script
# also loads debug and stackprof, so install the complete locked bundle.
WORKDIR /opt/dependabot-core/updater
RUN bundle config unset without && bundle install
WORKDIR /opt/dependabot-core
