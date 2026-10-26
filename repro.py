"""Deterministic issue recipes. Python standard library only; no model/API key."""
import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
REGISTRY_PORT = 443
EXIT = {"ready": 0, "reproduced": 0, "not_reproduced": 0,
        "blocked": 2, "needs_info": 3, "unsupported": 4}
QUESTIONS = {
    "manifest": "Provide the smallest .tf file containing the affected module source and version constraint.",
    "registry_upper_response": "Provide the HTTP status and sanitized JSON response for the module versions URL with its original uppercase spelling.",
    "registry_lower_response": "Provide the HTTP status and sanitized JSON response for the same URL with the module identifier lowercased.",
}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def expected_revision(spec):
    return os.environ.get("DEPENDABOT_SHA", spec["dependabot_sha"])


def run_logged(command, log, **kwargs):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, bufsize=1, **kwargs)
    assert process.stdout is not None
    for line in process.stdout:
        log.write(line)
        print(line, end="")
    return process.wait()


def catalog():
    return {spec["id"]: spec for spec in
            (read_json(path) for path in sorted((ROOT / "recipes").glob("*/recipe.json")))}


def assess(case, recipes=None):
    recipes = catalog() if recipes is None else recipes
    if not isinstance(case, dict):
        return {"status": "unsupported", "reason": "A case must be a JSON object."}
    if case.get("recipe") not in recipes:
        return {"status": "unsupported", "reason": "No reviewed recipe is available for this case."}
    missing = [key for key in QUESTIONS if not case.get(key)]
    if not isinstance(case.get("manifest"), str) and "manifest" not in missing:
        missing.append("manifest")
    if missing:
        return {"status": "needs_info", "missing_fields": missing,
                "questions": [QUESTIONS[key] for key in missing]}
    sources = re.findall(r'\bsource\s*=\s*"([^"]+)"', case["manifest"])
    if len(sources) != 1 or len(sources[0].split("/")) != 4:
        return {"status": "unsupported", "reason": "This recipe requires one registry module with hostname/namespace/name/provider."}
    identifier = sources[0].split("/", 1)[1]
    if identifier == identifier.lower():
        return {"status": "unsupported", "reason": "This recipe requires uppercase letters in the module identifier."}
    for key in ("registry_upper_response", "registry_lower_response"):
        response = case[key]
        if not isinstance(response, dict) or not isinstance(response.get("status"), int) or "body" not in response:
            return {"status": "needs_info", "missing_fields": [key], "questions": [QUESTIONS[key]]}
    upper = case["registry_upper_response"]
    modules = upper.get("body", {}).get("modules", []) if isinstance(upper.get("body"), dict) else []
    if (upper["status"] != 200 or not isinstance(modules, list) or not modules
            or not isinstance(modules[0], dict) or not isinstance(modules[0].get("versions"), list)):
        return {"status": "unsupported", "reason": "The uppercase control must return HTTP 200 with a versions array."}
    return {"status": "ready", "source": sources[0], "module_identifier": identifier}


def classify(evidence, requests, returncode, identifier):
    error = evidence.get("exception", {})
    lower = "/v1/modules/" + identifier.lower() + "/versions"
    real_requests = [r for r in requests if r.get("phase") == "dependabot"]
    lower_request = any(r["path"] == lower and r["status"] == 200
                        and r["body"] == {"modules": [{}]} for r in real_requests)
    stack = "\n".join(error.get("backtrace", []))
    if (returncode == 1 and evidence.get("stage") == "update_checker"
            and evidence.get("control", {}).get("status") == 200
            and evidence.get("module_identifier") == identifier.lower()
            and lower_request and error.get("class") == "KeyError"
            and '"versions"' in error.get("message", "")
            and "registry_client.rb" in stack and "all_module_versions" in stack):
        return "reproduced"
    if returncode == 0 and not error and evidence.get("latest_version") and any(
            r["path"].endswith("/versions") and r["status"] == 200 for r in real_requests):
        return "not_reproduced"
    return "blocked"


def write_report(output, result):
    status = result["status"]
    lines = ["# Investigation result", "", "Status: " + status,
             "Scope: " + result.get("scope", "not_executed"), "",
             "Issue: " + str(result.get("issue", "unspecified"))]
    if "dependabot_sha" in result:
        lines += ["Dependabot source: " + result["dependabot_sha"]]
    evidence = result.get("evidence", {})
    if evidence.get("module_identifier"):
        lines += ["Parsed module identifier: " + evidence["module_identifier"]]
    if result.get("reason"):
        lines += ["Reason: " + result["reason"]]
    lines += ["", "This run does not validate a proposed fix or a real registry deployment."]
    (output / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if status == "needs_info":
        draft = ["To construct a meaningful reproduction, please provide:", ""]
        draft += ["- " + question for question in result["questions"]]
    elif status == "reproduced":
        draft = [
            "I reproduced the reported module-name lowercasing and missing-versions failure",
            "using unmodified Dependabot at " + result["dependabot_sha"] + ".",
            "A synthetic HTTPS registry implements the two responses described in the issue.",
            "The real parser produced a lowercase identifier, the real registry client requested",
            "the lowercase module URL, and the checker raised KeyError for the missing versions key.",
            "This verifies the Core behavior under those responses; the reporter's actual registry deployment was not tested.",
        ]
    elif status == "not_reproduced":
        draft = ["The supplied synthetic case completed without the reported failure.",
                 "This result applies to the saved inputs and pinned revision; it does not disprove the issue."]
    elif status == "blocked":
        draft = ["The reproduction attempt was blocked: " + result.get("reason", "see checker.json and run.log"),
                 "This is an investigation/setup failure, so I cannot draw a conclusion about the reported issue."]
    else:
        draft = ["No reviewed recipe is available for this case. Human investigation is needed."]
    draft += ["", "Reproducer link: add the published repository or evidence URL before posting."]
    (output / "comment-draft.md").write_text("\n".join(draft) + "\n", encoding="utf-8")


def finish(output, result):
    write_json(output / "result.json", result)
    write_report(output, result)
    print(json.dumps({"status": result["status"], "artifacts": str(output)}))
    return EXIT[result["status"]]


def run(recipe_id, output, case_path=None):
    output.mkdir(parents=True, exist_ok=False)
    recipes = catalog()
    if recipe_id not in recipes:
        return finish(output, {"status": "unsupported", "recipe": recipe_id,
                               "reason": "No reviewed recipe is available."})
    spec = recipes[recipe_id]
    try:
        case = read_json(case_path or ROOT / "recipes" / recipe_id / "case.json")
    except (OSError, ValueError) as exc:
        return finish(output, {**spec, "status": "blocked", "reason": "Cannot read case: " + str(exc)})
    validation = assess(case)
    result = {**spec, "issue": case.get("issue") if isinstance(case, dict) else None,
              "started_at": datetime.now(timezone.utc).isoformat(),
              **validation}
    if os.environ.get("REPRO_IMAGE_ID"):
        result["image_id"] = os.environ["REPRO_IMAGE_ID"]
    write_json(output / "case.json", case)
    if validation["status"] != "ready":
        return finish(output, result)
    if case["recipe"] != recipe_id:
        return finish(output, {**result, "status": "unsupported", "reason": "Case and requested recipe differ."})
    result["status"] = "blocked"
    requests = []
    server = None
    try:
        upstream = Path(os.environ.get("DEPENDABOT_CORE", "/opt/dependabot-core"))
        revision = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
        if revision != expected_revision(spec):
            raise RuntimeError("Dependabot checkout does not match the expected revision.")
        if subprocess.check_output(["git", "-C", str(upstream), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
            raise RuntimeError("Tracked upstream source has modifications.")
        subprocess.run(["bundle", "check"], check=True, capture_output=True, text=True)
        result["dependabot_sha"] = revision
        result["ruby"] = subprocess.check_output(["ruby", "--version"], text=True).strip()
        identifier = validation["module_identifier"]
        upper = "/v1/modules/" + identifier + "/versions"
        lower = "/v1/modules/" + identifier.lower() + "/versions"
        routes = {
            "/.well-known/terraform.json": {"status": 200, "body": {"modules.v1": "/v1/modules/"}},
            upper: case["registry_upper_response"], lower: case["registry_lower_response"],
        }
        with tempfile.TemporaryDirectory(prefix="registry-") as temp:
            temp = Path(temp)
            ca, cert, key = temp / "ca.pem", temp / "cert.pem", temp / "key.pem"
            (temp / "server.ext").write_text(
                "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n"
                "extendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n")
            commands = [
                ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                 "-keyout", str(temp / "ca-key.pem"), "-out", str(ca), "-subj", "/CN=Reproducer CA",
                 "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"],
                ["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key),
                 "-out", str(temp / "server.csr"), "-subj", "/CN=localhost"],
                ["openssl", "x509", "-req", "-in", str(temp / "server.csr"), "-CA", str(ca),
                 "-CAkey", str(temp / "ca-key.pem"), "-CAcreateserial", "-out", str(cert),
                 "-days", "1", "-extfile", str(temp / "server.ext")],
            ]
            for command in commands:
                subprocess.run(command, check=True, capture_output=True, timeout=30)

            class Registry(BaseHTTPRequestHandler):
                protocol_version = "HTTP/1.1"

                def log_message(self, *_args):
                    pass

                def do_GET(self):
                    response = routes.get(self.path, {"status": 404, "body": {"error": "unknown fixture route"}})
                    if self.headers.get("Authorization") != "Bearer fixture-only":
                        response = {"status": 401, "body": {"error": "fixture token required"}}
                    requests.append({"path": self.path, **response,
                                     "phase": self.headers.get("X-Repro-Phase", "dependabot")})
                    print("[registry] " + requests[-1]["phase"] + " " + self.path +
                          " -> " + str(response["status"]), flush=True)
                    data = json.dumps(response["body"]).encode()
                    self.send_response(response["status"])
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    self.wfile.write(data)

            class RegistryServer(ThreadingHTTPServer):
                daemon_threads = True

                def get_request(self):
                    connection, address = super().get_request()
                    connection.settimeout(10)
                    try:
                        return context.wrap_socket(connection, server_side=True), address
                    except Exception:
                        connection.close()
                        raise

                def shutdown_request(self, request):
                    # Send TLS close_notify. Raw socket shutdown causes Ruby/OpenSSL
                    # to reject an otherwise valid response as an unexpected EOF.
                    try:
                        request.settimeout(2)
                        request.unwrap().close()
                    except (OSError, ValueError):
                        request.close()

            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            context.load_cert_chain(cert, key)
            server = RegistryServer(("127.0.0.1", REGISTRY_PORT), Registry)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            client = ssl.create_default_context(cafile=str(ca))
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                urllib.request.HTTPSHandler(context=client))
            controls = []
            for path, expected in routes.items():
                request = urllib.request.Request("https://localhost" + path,
                    headers={"Authorization": "Bearer fixture-only", "X-Repro-Phase": "fixture-check"})
                try:
                    response = opener.open(request, timeout=10)
                except urllib.error.HTTPError as exc:
                    response = exc
                with response:
                    actual = {"status": response.status, "body": json.load(response)}
                if actual != expected:
                    raise RuntimeError("Fixture control failed for " + path)
                controls.append({"path": path, **actual})
            write_json(output / "fixture-checks.json", controls)
            manifest = case["manifest"].replace(validation["source"], "localhost/" + identifier)
            (output / "main.tf").write_text(manifest, encoding="utf-8")
            result["manifest_sha256"] = hashlib.sha256(manifest.encode()).hexdigest()
            env = {k: v for k, v in os.environ.items()
                   if k.lower() not in {"http_proxy", "https_proxy", "all_proxy"}}
            env.update(REPRO_CA=str(ca), SSL_CERT_FILE=str(ca), NO_PROXY="localhost,127.0.0.1",
                       REPRO_UPPER_URL="https://localhost" + upper)
            command = ["bundle", "exec", "ruby", str(ROOT / "recipes" / recipe_id / "check.rb"),
                       str(output / "main.tf"), str(output / "checker.json")]
            result["command"] = command
            with (output / "run.log").open("w", encoding="utf-8") as log:
                returncode = run_logged(command, log, env=env)
            evidence = read_json(output / "checker.json")
            result.update(exit_code=returncode, evidence=evidence,
                          status=classify(evidence, requests, returncode, identifier))
            if result["status"] == "blocked":
                error = evidence.get("exception", {})
                result["reason"] = str(error.get("cause") or error or "Expected evidence was not produced.")
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        result.update(status="blocked", reason=str(exc))
    finally:
        if server:
            server.shutdown()
            server.server_close()
        write_json(output / "requests.json", requests)
    return finish(output, result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list")
    assessment = commands.add_parser("assess")
    assessment.add_argument("case", type=Path)
    assessment.add_argument("--output", type=Path)
    inspect = commands.add_parser("inspect", help="Snapshot a public issue and select a reviewed recipe.")
    inspect.add_argument("issue")
    inspect.add_argument("--output", type=Path)
    execution = commands.add_parser("run")
    execution.add_argument("recipe")
    execution.add_argument("--case", type=Path)
    execution.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "list":
        print(json.dumps(list(catalog().values()), indent=2))
        return 0
    output = (args.output or ROOT / "artifacts" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")).resolve()
    if args.command == "run":
        return run(args.recipe, output, args.case)
    output.mkdir(parents=True, exist_ok=False)
    if args.command == "assess":
        try:
            case = read_json(args.case)
        except (OSError, ValueError) as exc:
            return finish(output, {"status": "blocked", "reason": "Cannot read case: " + str(exc)})
        write_json(output / "case.json", case)
        return finish(output, {"issue": case.get("issue") if isinstance(case, dict) else None, **assess(case)})
    match = re.fullmatch(r"https://github.com/dependabot/dependabot-core/issues/([1-9][0-9]*)/?", args.issue)
    if not match:
        return finish(output, {"status": "unsupported", "issue": args.issue,
                               "reason": "Only public dependabot/dependabot-core issue URLs are supported."})
    issue = args.issue.rstrip("/")
    try:
        snapshots = {}
        for suffix in ("", "/comments"):
            request = urllib.request.Request(
                "https://api.github.com/repos/dependabot/dependabot-core/issues/" + match[1] + suffix,
                headers={"Accept": "application/vnd.github+json", "User-Agent": "dependabot-repro"})
            with urllib.request.urlopen(request, timeout=30) as response:
                snapshots[suffix or "issue"] = json.load(response)
        write_json(output / "issue-snapshot.json", snapshots)
        spec = next((spec for spec in catalog().values() if issue in spec["issues"]), None)
        return finish(output, {"issue": issue, "status": "ready" if spec else "unsupported",
                               "recipe": spec["id"] if spec else None,
                               "note": "Selection uses curated issue mappings. No arbitrary issue code is executed; no reproduction has run."})
    except (OSError, ValueError) as exc:
        return finish(output, {"issue": issue, "status": "blocked", "reason": str(exc)})


if __name__ == "__main__":
    raise SystemExit(main())
