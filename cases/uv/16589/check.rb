require "json"
require "toml-rb"
require "dependabot/dependency_file"
require "dependabot/source"
require "dependabot/credential"
require "dependabot/uv/file_parser"

def parse_manifest(content)
  file = Dependabot::DependencyFile.new(name: "pyproject.toml", content: content)
  Dependabot::Uv::FileParser.new(dependency_files: [file], source: nil, credentials: []).parse.map do |dependency|
    {
      name: dependency.name,
      requirements: dependency.requirements.map do |requirement|
        { file: requirement.file, requirement: requirement.requirement, groups: requirement.groups }
      end
    }
  end
end

evidence = { stage: "inputs" }
begin
  manifest = File.read(File.join(ARGV.fetch(0), "pyproject.toml"))
  control = File.read(File.join(ARGV.fetch(0), "control.toml"))
  document = TomlRB.parse(manifest)
  raise "Fixture must declare requests>=2.31.0" unless document.dig("project", "dependencies") == ["requests>=2.31.0"]
  raise "Fixture must use build-only tool.poetry" unless document.dig("tool", "poetry") == { "packages" => [{ "include" => "example" }] }
  document.fetch("tool").delete("poetry")
  document.delete("tool") if document.fetch("tool").empty?
  raise "Control must remove only tool.poetry" unless document == TomlRB.parse(control)

  evidence[:stage] = "control"
  evidence[:control] = { dependencies: parse_manifest(control) }
  evidence[:stage] = "parser"
  evidence[:actual] = { dependencies: parse_manifest(manifest) }
rescue StandardError => error
  evidence[:exception] = { class: error.class.name, message: error.message, backtrace: error.backtrace }
ensure
  File.write(ARGV.fetch(1), JSON.pretty_generate(evidence))
end
exit(evidence.key?(:exception) ? 1 : 0)
