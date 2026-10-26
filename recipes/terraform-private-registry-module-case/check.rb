# frozen_string_literal: true

require "json"
require "dependabot/dependency_file"
require "dependabot/credential"
require "dependabot/terraform/file_parser"
require "dependabot/terraform/update_checker"

Excon.defaults[:ssl_ca_file] = ENV.fetch("REPRO_CA")
evidence = { stage: "parser" }
begin
  credentials = [Dependabot::Credential.new(
    "type" => "terraform_registry", "host" => "localhost", "token" => "fixture-only"
  )]
  files = [Dependabot::DependencyFile.new(name: "main.tf", content: File.read(ARGV.fetch(0)))]
  dependencies = Dependabot::Terraform::FileParser.new(
    dependency_files: files, source: nil, credentials: credentials
  ).parse
  raise "Expected exactly one registry module" unless dependencies.length == 1

  dependency = dependencies.first
  evidence[:dependency] = dependency.name
  evidence[:module_identifier] = dependency.source_details.fetch(:module_identifier)

  # Check the same Ruby HTTPS client before attributing any error to Dependabot.
  evidence[:stage] = "ruby_https_control"
  control = Excon.get(
    ENV.fetch("REPRO_UPPER_URL"),
    headers: { "Authorization" => "Bearer fixture-only", "X-Repro-Phase" => "ruby-control" }
  )
  evidence[:control] = { status: control.status, body: JSON.parse(control.body) }
  unless control.status == 200 && evidence[:control][:body].dig("modules", 0, "versions").is_a?(Array)
    raise "Uppercase registry control did not return versions"
  end

  evidence[:stage] = "update_checker"
  checker = Dependabot::Terraform::UpdateChecker.new(
    dependency: dependency, dependency_files: files, credentials: credentials
  )
  evidence[:latest_version] = checker.latest_version&.to_s
rescue StandardError => e
  evidence[:exception] = { class: e.class.name, message: e.message, backtrace: e.backtrace }
  evidence[:exception][:cause] = { class: e.cause.class.name, message: e.cause.message } if e.cause
ensure
  File.write(ARGV.fetch(1), JSON.pretty_generate(evidence))
end
exit(evidence.key?(:exception) ? 1 : 0)
