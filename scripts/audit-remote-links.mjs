#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function expandHome(path) {
  if (!path) return path;
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function loadDesktopSshConfig() {
  const desktopJson = join(homedir(), ".hermes", "desktop.json");
  if (!existsSync(desktopJson)) return null;
  try {
    const parsed = JSON.parse(readFileSync(desktopJson, "utf8"));
    return parsed.connectionMode === "ssh" ? parsed.sshConfig : null;
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));
const saved = loadDesktopSshConfig() || {};
const host = args.host || process.env.ACTIVI_SSH_HOST || saved.host;
const user =
  args.user || process.env.ACTIVI_SSH_USER || saved.username || "root";
const port = args.port || process.env.ACTIVI_SSH_PORT || saved.port || "22";
const key = expandHome(
  args.key || process.env.ACTIVI_SSH_KEY || saved.keyPath || "~/.ssh/id_rsa",
);

if (!host) {
  console.error(
    "Missing SSH host. Use --host <host>, ACTIVI_SSH_HOST, or ~/.hermes/desktop.json.",
  );
  process.exit(2);
}

const remoteScript = String.raw`
import json, os, re, subprocess
from pathlib import Path

home = Path.home() / ".hermes"
profiles_dir = home / "profiles"

def run(cmd, timeout=8):
    try:
        p = subprocess.run(cmd, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
        return p.returncode, p.stdout.strip()
    except Exception as exc:
        return 999, str(exc)

def pid_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False

def read_pid(path):
    if not path.exists():
        return None
    try:
        raw = path.read_text().strip()
        if raw.startswith("{"):
            return json.loads(raw).get("pid")
        return int(raw)
    except Exception:
        return "unreadable"

def parse_config(path):
    config = path / "config.yaml"
    out = {"exists": config.exists(), "model": None, "provider": None}
    if not config.exists():
        return out
    text = config.read_text(errors="ignore")
    model = re.search(r'^\s*default:\s*["\']?([^"\'\n#]+)', text, re.M)
    provider = re.search(r'^\s*provider:\s*["\']?([^"\'\n#]+)', text, re.M)
    out["model"] = model.group(1).strip() if model else None
    out["provider"] = provider.group(1).strip() if provider else None
    return out

def count_skills(path):
    skills = path / "skills"
    return sum(1 for _ in skills.glob("*/*/SKILL.md")) if skills.is_dir() else 0

def report_profile(name, path, is_default=False):
    pid = read_pid(path / "gateway.pid")
    cfg = parse_config(path)
    return {
        "profile": name,
        "path": str(path),
        "is_default": is_default,
        "config": cfg["exists"],
        "provider": cfg["provider"],
        "model": cfg["model"],
        "env_file": (path / ".env").exists(),
        "soul": (path / "SOUL.md").exists(),
        "memory_dir": (path / "memories").is_dir(),
        "state_db": (path / "state.db").exists(),
        "skills": count_skills(path),
        "gateway_pid_file": (path / "gateway.pid").exists(),
        "gateway_pid": pid,
        "gateway_alive_by_pid": pid_alive(pid) if isinstance(pid, int) else False,
    }

profiles = [report_profile("default", home, True)]
if profiles_dir.is_dir():
    for path in sorted(profiles_dir.iterdir()):
        if path.is_dir() and not path.name.startswith("."):
            profiles.append(report_profile(path.name, path, False))

_, version = run("hermes --version 2>/dev/null || true")
_, hermes_path = run("command -v hermes || true")
profile_create_code, profile_create_help = run("hermes profile create --help 2>&1", 8)
profiles_create_code, profiles_create_help = run("hermes profiles create --help 2>&1", 8)
skills_browse_json_code, skills_browse_json = run("hermes skills browse --json 2>&1", 8)
skills_browse_code, skills_browse = run("hermes skills browse --size 1 2>&1", 12)
active_profile = (home / "active_profile").read_text(errors="ignore").strip() if (home / "active_profile").exists() else "default"
global_pid = read_pid(home / "gateway.pid")
_, health = run("curl -sS -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:8642/health || true")
_, processes = run("ps -eo pid,ppid,command | grep -E 'hermes|gateway|api_server|uvicorn' | grep -v grep", 8)
_, ports = run("ss -ltnp 2>/dev/null | grep -E ':8642|:18789|:3000' || true", 8)

api_server = Path("/usr/local/lib/hermes-agent/gateway/platforms/api_server.py")
api_text = api_server.read_text(errors="ignore") if api_server.exists() else ""
api_profile_request_support = any(token in api_text for token in ["X-Hermes-Profile", "body.get(\"profile\"", "body.get('profile'"])
api_runtime_model_from_request = "body.get(\"model\"" in api_text and "_resolve_gateway_model" not in api_text
api_session_id_header = "X-Hermes-Session-Id" in api_text
api_session_id_body = "body.get(\"session_id\"" in api_text or "body.get('session_id'" in api_text

settings_links = {
    "active_profile_file": active_profile,
    "profile_create_command": "hermes profile create",
    "profile_create_supported": profile_create_code == 0,
    "plural_profiles_create_supported": profiles_create_code == 0,
    "skills_browse_json_supported": skills_browse_json_code == 0,
    "skills_browse_plain_supported": skills_browse_code == 0,
    "api_profile_request_supported": api_profile_request_support,
    "api_session_id_header_supported": api_session_id_header,
    "api_session_id_body_supported": api_session_id_body,
    "api_runtime_model_from_request_body": api_runtime_model_from_request,
}

findings = []
if any(item["profile"] == "default" and not item["is_default"] for item in profiles):
    findings.append("Duplicate named profile 'default' exists under ~/.hermes/profiles/default; desktop UI should ignore it or the folder should be backed up and removed.")
for item in profiles:
    if not item["is_default"] and not item["config"] and not item["env_file"] and item["skills"] == 0:
        findings.append(f"Profile '{item['profile']}' looks empty/incomplete.")
if isinstance(global_pid, int) and pid_alive(global_pid):
    no_profile_gateway = [item["profile"] for item in profiles if not item["is_default"] and not item["gateway_alive_by_pid"]]
    if no_profile_gateway:
        findings.append("Global gateway is running, but these profiles have no per-profile gateway pid: " + ", ".join(no_profile_gateway))
        findings.append("Named profile gateway status should be shown separately from the global default gateway.")
if profiles_create_code != 0:
    findings.append("Remote CLI uses singular 'hermes profile ...'; plural 'hermes profiles ...' is invalid.")
if skills_browse_json_code != 0:
    findings.append("Remote CLI 'hermes skills browse --json' is unsupported; desktop must parse filesystem/registry instead of expecting JSON.")
if api_session_id_header and not api_session_id_body:
    findings.append("Remote API continues chat sessions via X-Hermes-Session-Id header, not request-body session_id.")
if not api_profile_request_support:
    findings.append("Remote API server does not expose per-request profile selection; named profiles should use CLI or a profile-specific gateway.")
if not api_runtime_model_from_request:
    findings.append("Remote API server advertises request model in responses but runtime model comes from gateway config at startup.")

print(json.dumps({
    "hermes_version": version.splitlines()[0] if version else None,
    "hermes_path": hermes_path or None,
    "global_gateway": {
        "pid_file": (home / "gateway.pid").exists(),
        "pid": global_pid,
        "alive_by_pid": pid_alive(global_pid) if isinstance(global_pid, int) else False,
        "health_8642": health or None,
    },
    "ports": ports or None,
    "processes": processes or None,
    "settings_links": settings_links,
    "profiles": profiles,
    "findings": findings,
}, indent=2, ensure_ascii=False))
`;

const sshArgs = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "ConnectTimeout=15",
  "-i",
  key,
  "-p",
  String(port),
  `${user}@${host}`,
  "python3 -",
];

const result = spawnSync("ssh", sshArgs, {
  input: remoteScript,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "SSH audit failed");
  process.exit(result.status || 1);
}

process.stdout.write(result.stdout);
