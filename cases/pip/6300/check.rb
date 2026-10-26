require "json"
require "dependabot/python/version"
require "dependabot/python/requirement"

evidence = { stage: "control" }
begin
  data = JSON.parse(File.read(ARGV.fetch(0)))
  reference = JSON.parse(File.read(ARGV.fetch(1)))
  raise "Reference validation failed" unless reference["valid"] && reference["ordered_versions"] == data["ordered_versions"]
  version_class = Dependabot::Python::Version
  requirement_class = Dependabot::Python::Requirement
  evidence[:reference] = reference
  evidence[:control] = version_class.new("1.0") < version_class.new("2.0") &&
                       requirement_class.new("^8.0.3").satisfied_by?(version_class.new("8.1.0"))
  raise "Basic version/requirement control failed" unless evidence[:control]

  evidence[:stage] = "versions"
  evidence[:parsing_errors] = []
  versions = data.fetch("ordered_versions").filter_map do |value|
    begin
      [value, version_class.new(value)]
    rescue ArgumentError => error
      evidence[:parsing_errors] << { version: value, class: error.class.name, message: error.message }
      nil
    end
  end
  evidence[:core_order] = versions.sort { |left, right| left[1] <=> right[1] }.map(&:first)

  evidence[:stage] = "caret"
  evidence[:caret] = { requirement: data.fetch("caret_requirement") }
  begin
    requirement = requirement_class.new(data.fetch("caret_requirement"))
    evidence[:caret][:checks] = {
      lower_bound: requirement.satisfied_by?(version_class.new("8.0.3.0.1")),
      within_range: requirement.satisfied_by?(version_class.new("8.1.0")),
      excludes_previous_major: !requirement.satisfied_by?(version_class.new("7.9")),
      excludes_next_major: !requirement.satisfied_by?(version_class.new("9.0"))
    }
  rescue Gem::Requirement::BadRequirementError => error
    evidence[:caret][:exception] = { class: error.class.name, message: error.message, backtrace: error.backtrace }
  end
  evidence[:stage] = "complete"
rescue StandardError => error
  evidence[:exception] = { class: error.class.name, message: error.message, backtrace: error.backtrace }
ensure
  File.write(ARGV.fetch(2), JSON.pretty_generate(evidence))
end
exit(evidence.key?(:exception) ? 1 : 0)
