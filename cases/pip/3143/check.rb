require "json"
require "fileutils"
require "dependabot/dependency"
require "dependabot/dependency_file"
require "dependabot/source"
require "dependabot/credential"
require "dependabot/python/file_parser"
require "dependabot/python/file_updater"

def update(files, from, to)
  requirements = files.select { |file| file.name.end_with?(".in") }.map do |file|
    { file: file.name, requirement: "==#{to}", groups: [], source: nil }
  end
  dependency = Dependabot::Dependency.new(
    name: "repro-demo", version: to, previous_version: from, package_manager: "pip",
    requirements: requirements,
    previous_requirements: requirements.map { |requirement| requirement.merge(requirement: "==#{from}") }
  )
  Dependabot::Python::FileUpdater.new(dependencies: [dependency], dependency_files: files, credentials: []).updated_dependency_files
end

def save_files(files, directory)
  files.to_h do |file|
    path = File.join(directory, file.name)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, file.content)
    [file.name, file.content]
  end
end

evidence = { stage: "control" }
begin
  output = ARGV.fetch(0)
  manifest = File.read(File.join(output, "requirements.in"))
  compiled = File.read(File.join(output, "requirements.txt"))
  raise "Unexpected fixture requirement" unless manifest.strip == "repro-demo==1.0.0"
  raise "Expected original relative annotation" unless compiled.include?("# via -r requirements.in")
  file = ->(name, content) { Dependabot::DependencyFile.new(name: name, content: content) }
  control = update([file.call("requirements.in", manifest), file.call("requirements.txt", compiled)], "1.0.0", "2.0.0")
  evidence[:control] = save_files(control, File.join(output, "control"))

  evidence[:stage] = "grouped"
  grouped_inputs = %w(ussd other).flat_map do |directory|
    [file.call("#{directory}/requirements.in", manifest), file.call("#{directory}/requirements.txt", compiled)]
  end
  grouped = update(grouped_inputs, "1.0.0", "2.0.0")
  evidence[:grouped] = save_files(grouped, File.join(output, "grouped"))

  evidence[:stage] = "single"
  single_inputs = %w(requirements.in requirements.txt).map do |name|
    content = grouped.find { |updated| updated.name == "ussd/#{name}" }&.content
    raise "Grouped update did not return #{name}" unless content
    file.call(name, content)
  end
  single = update(single_inputs, "2.0.0", "3.0.0")
  evidence[:single] = save_files(single, File.join(output, "single"))
  evidence[:stage] = "complete"
rescue StandardError => error
  evidence[:exception] = { class: error.class.name, message: error.message, backtrace: error.backtrace }
ensure
  File.write(ARGV.fetch(1), JSON.pretty_generate(evidence))
end
exit(evidence.key?(:exception) ? 1 : 0)
