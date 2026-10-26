"""Reproduce Dependabot Core issue #16622 using a local HTTPS registry."""
import argparse, json, os, ssl, subprocess, tempfile, threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
SHA = "7683222c5d538d4125b170ddfb85a4e3663fb8b7"
UPPER = "/v1/modules/acme/RDS/aws/versions"
LOWER = "/v1/modules/acme/rds/aws/versions"
VERSIONS, MISSING = {"modules": [{"versions": [{"version": "1.0.0"}, {"version": "1.1.0"}]}]}, {"modules": [{}]}

def dump(path, value): Path(path).write_text(json.dumps(value, indent=2) + "\n")

def classified(evidence, requests, code):
    error = evidence.get("exception", {})
    seen = any(r.get("phase") == "dependabot" and r.get("path") == LOWER and r.get("body") == MISSING for r in requests)
    stack = "\n".join(error.get("backtrace", []))
    return (code == 1 and evidence.get("stage") == "update_checker" and evidence.get("control", {}).get("status") == 200 and seen and error.get("class") == "KeyError" and '"versions"' in error.get("message", "") and "all_module_versions" in stack)

def run(output):
    output.mkdir(parents=True, exist_ok=False)
    result, requests, server = {"issue": "https://github.com/dependabot/dependabot-core/issues/16622", "dependabot_sha": SHA, "started_at": datetime.now(timezone.utc).isoformat(), "status": "blocked"}, [], None
    try:
        core = Path(os.getenv("DEPENDABOT_CORE", "/opt/dependabot-core"))
        if subprocess.check_output(["git", "-C", str(core), "rev-parse", "HEAD"], text=True).strip() != SHA: raise RuntimeError("Pinned Dependabot revision is wrong")
        if subprocess.check_output(["git", "-C", str(core), "status", "--porcelain"], text=True).strip(): raise RuntimeError("Pinned Dependabot checkout has changes")
        subprocess.run(["bundle", "check"], check=True, capture_output=True)
        routes = {"/.well-known/terraform.json": {"status": 200, "body": {"modules.v1": "/v1/modules/"}}, UPPER: {"status": 200, "body": VERSIONS}, LOWER: {"status": 200, "body": MISSING}}
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp); ca, cert, key = tmp / "ca.pem", tmp / "cert.pem", tmp / "key.pem"
            (tmp / "ext").write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n")
            commands = [["openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","1","-keyout",str(tmp/"ca-key.pem"),"-out",str(ca),"-subj","/CN=CA","-addext","basicConstraints=critical,CA:TRUE","-addext","keyUsage=critical,keyCertSign,cRLSign"],["openssl","req","-new","-newkey","rsa:2048","-nodes","-keyout",str(key),"-out",str(tmp/"csr"),"-subj","/CN=localhost"],["openssl","x509","-req","-in",str(tmp/"csr"),"-CA",str(ca),"-CAkey",str(tmp/"ca-key.pem"),"-CAcreateserial","-out",str(cert),"-days","1","-extfile",str(tmp/"ext")]]
            for command in commands: subprocess.run(command, check=True, capture_output=True)
            class Registry(BaseHTTPRequestHandler):
                def log_message(self, *_): pass
                def do_GET(self):
                    response = routes.get(self.path, {"status": 404, "body": {}})
                    if self.headers.get("Authorization") != "Bearer fixture-only": response = {"status": 401, "body": {}}
                    requests.append({"path": self.path, "phase": self.headers.get("X-Repro-Phase", "dependabot"), **response})
                    data = json.dumps(response["body"]).encode(); self.send_response(response["status"]); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(cert, key)
            class Server(ThreadingHTTPServer):
                def get_request(self):
                    sock, address = super().get_request(); return context.wrap_socket(sock, server_side=True), address
                def shutdown_request(self, request):
                    try:
                        request.settimeout(2); request.unwrap().close()
                    except (OSError, ValueError):
                        request.close()
            server = Server(("127.0.0.1", 443), Registry); threading.Thread(target=server.serve_forever, daemon=True).start()
            main = output / "main.tf"; main.write_text('module "database" {\n  source = "localhost/acme/RDS/aws"\n  version = "~> 1.0"\n}\n')
            env = {k:v for k,v in os.environ.items() if k.lower() not in {"http_proxy","https_proxy","all_proxy"}}
            env.update(REPRO_CA=str(ca), SSL_CERT_FILE=str(ca), NO_PROXY="localhost,127.0.0.1", REPRO_UPPER_URL="https://localhost"+UPPER)
            with (output / "run.log").open("w") as log: process = subprocess.run(["bundle","exec","ruby",str(ROOT/"check.rb"),str(main),str(output/"checker.json")], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=120)
            evidence = json.loads((output / "checker.json").read_text()); result.update(exit_code=process.returncode, evidence=evidence, status="reproduced" if classified(evidence, requests, process.returncode) else "blocked")
    except (OSError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as error: result["reason"] = str(error)
    finally:
        if server: server.shutdown(); server.server_close()
        dump(output / "requests.json", requests); dump(output / "result.json", result)
    print(json.dumps({"status": result["status"], "output": str(output)})); return 0 if result["status"] == "reproduced" else 2

parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--output", type=Path, default=Path(tempfile.mkdtemp(prefix="dependabot-16622-")))
if __name__ == "__main__": raise SystemExit(run(parser.parse_args().output.resolve()))
