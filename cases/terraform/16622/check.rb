require "json"
require "dependabot/dependency_file"
require "dependabot/credential"
require "dependabot/terraform/file_parser"
require "dependabot/terraform/update_checker"
Excon.defaults[:ssl_ca_file] = ENV.fetch("REPRO_CA")
evidence = { stage: "parser" }
begin
  credentials = [Dependabot::Credential.new("type" => "terraform_registry", "host" => "localhost", "token" => "fixture-only")]
  files = [Dependabot::DependencyFile.new(name: "main.tf", content: File.read(ARGV.fetch(0)))]
  dependency = Dependabot::Terraform::FileParser.new(dependency_files: files, source: nil, credentials: credentials).parse.fetch(0)
  evidence[:module_identifier] = dependency.source_details[:module_identifier]
  evidence[:stage] = "ruby_https_control"
  control = Excon.get(ENV.fetch("REPRO_UPPER_URL"), headers: { "Authorization" => "Bearer fixture-only", "X-Repro-Phase" => "ruby-control" })
  evidence[:control] = { status: control.status, body: JSON.parse(control.body) }
  raise "control failed" unless control.status == 200
  evidence[:stage] = "update_checker"
  evidence[:latest_version] = Dependabot::Terraform::UpdateChecker.new(dependency: dependency, dependency_files: files, credentials: credentials).latest_version&.to_s
rescue StandardError => error
  evidence[:exception] = { class: error.class.name, message: error.message, backtrace: error.backtrace }
ensure
  File.write(ARGV.fetch(1), JSON.pretty_generate(evidence))
end
exit(evidence.key?(:exception) ? 1 : 0)
