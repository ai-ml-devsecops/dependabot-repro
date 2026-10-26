"""Reusable baseline/candidate runner. No issue-specific assertions live here."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
SHA = re.compile(r"^[0-9a-f]{40}$")
RECIPE = re.compile(r"^[a-z0-9-]+$")


def verdict(baseline, candidate):
    """Only a successful baseline and reproduced candidate establish regression evidence."""
    a, b = baseline.get("status"), candidate.get("status")
    if a not in {"reproduced", "not_reproduced"} or b not in {"reproduced", "not_reproduced"}:
        return "inconclusive"
    if a == "not_reproduced" and b == "reproduced":
        return "regression_observed"
    if a == "reproduced" and b == "not_reproduced":
        return "failure_resolved"
    if a == "reproduced":
        return "failure_in_both"
    return "failure_in_neither"


def execute(command, log):
    with log.open("w", encoding="utf-8") as stream:
        return subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=False).returncode


def compare(recipe, baseline, candidate, output, docker="docker", case=None):
    if not RECIPE.fullmatch(recipe):
        raise ValueError("Invalid recipe name")
    if not SHA.fullmatch(baseline) or not SHA.fullmatch(candidate):
        raise ValueError("Use complete 40-character upstream commit SHAs")
    if baseline == candidate:
        raise ValueError("Baseline and candidate must be different revisions")
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    results = {}
    for label, sha in (("baseline", baseline), ("candidate", candidate)):
        folder = output / label
        folder.mkdir()
        image = "dependabot-repro:" + sha[:12]
        build = [docker, "build", "--progress=plain", "-f", ".devcontainer/Dockerfile",
                 "--build-arg", "DEPENDABOT_SHA=" + sha, "-t", image, "."]
        build_code = execute(build, folder / "build.log")
        if build_code:
            results[label] = {"status": "blocked", "reason": "Image build failed", "sha": sha}
            continue
        command = [docker, "run", "--rm", "--network", "none", "--memory", "4g",
                   "--cpus", "2", "--pids-limit", "256",
                   "--mount", "type=bind,src=" + str(folder.resolve()) + ",dst=/artifacts"]
        if case:
            command += ["--mount", "type=bind,src=" + str(case.resolve()) +
                        ",dst=/case.json,readonly"]
        command += [image, "python3", "repro.py", "run", recipe,
                    "--output", "/artifacts/evidence"]
        if case:
            command += ["--case", "/case.json"]
        run_code = execute(command, folder / "run.log")
        result_path = folder / "evidence" / "result.json"
        if not result_path.exists():
            results[label] = {"status": "blocked", "reason": "Missing result.json", "exit_code": run_code, "sha": sha}
            continue
        try:
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if result.get("status") not in {"reproduced", "not_reproduced", "blocked", "needs_info", "unsupported"}:
                raise ValueError("Unknown result status")
            results[label] = {"status": result["status"], "sha": sha, "exit_code": run_code,
                              "evidence": str(result_path.relative_to(output))}
        except (ValueError, OSError) as exc:
            results[label] = {"status": "blocked", "sha": sha, "reason": str(exc)}
    summary = {"recipe": recipe, "baseline": results["baseline"], "candidate": results["candidate"],
               "verdict": verdict(results["baseline"], results["candidate"]),
               "created_at": datetime.now(timezone.utc).isoformat()}
    (output / "comparison.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe")
    parser.add_argument("--baseline", required=True, help="Full upstream commit SHA")
    parser.add_argument("--candidate", required=True, help="Full upstream commit SHA")
    parser.add_argument("--case", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.case and not args.case.is_file():
        parser.error("--case must point to an existing JSON file")
    output = (args.output or ROOT / "artifacts" / datetime.now(timezone.utc).strftime("compare-%Y%m%dT%H%M%S.%fZ")).resolve()
    try:
        result = compare(args.recipe, args.baseline, args.candidate, output, case=args.case)
    except (ValueError, FileExistsError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    return 0 if result["verdict"] != "inconclusive" else 2


if __name__ == "__main__":
    sys.exit(main())
