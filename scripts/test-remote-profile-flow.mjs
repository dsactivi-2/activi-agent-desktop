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
const timestamp = Date.now().toString(36);
const profile = (args.profile || `activi_e2e_${timestamp}`).toLowerCase();
const model = args.model || "deepseek-v4-flash:cloud";
const marker = `ACTIVI_E2E_${timestamp.toUpperCase()}`;
const clone = args.clone !== "false" && args["no-clone"] !== "true";

if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)) {
  console.error("Invalid test profile name.");
  process.exit(2);
}

if (!host) {
  console.error(
    "Missing SSH host. Use --host <host>, ACTIVI_SSH_HOST, or ~/.hermes/desktop.json.",
  );
  process.exit(2);
}

const remoteScript = String.raw`
import json, os, re, shutil, sqlite3, subprocess, sys, textwrap
from pathlib import Path

profile = sys.argv[1]
model = sys.argv[2]
marker = sys.argv[3]
clone = sys.argv[4] == "true"
home = Path.home() / ".hermes"
profile_dir = home / "profiles" / profile

def run(cmd, timeout=120):
    try:
        p = subprocess.run(cmd, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
        return {"code": p.returncode, "output": p.stdout.strip()[-4000:]}
    except Exception as exc:
        return {"code": 999, "output": str(exc)}

def shquote(value):
    return "'" + value.replace("'", "'\"'\"'") + "'"

def count_skills(path):
    skills = path / "skills"
    return sum(1 for _ in skills.glob("*/*/SKILL.md")) if skills.is_dir() else 0

def read_config(path):
    config = path / "config.yaml"
    if not config.exists():
        return {"exists": False, "provider": None, "model": None}
    text = config.read_text(errors="ignore")
    provider = re.search(r'^\s*provider:\s*["\']?([^"\'\n#]+)', text, re.M)
    default = re.search(r'^\s*default:\s*["\']?([^"\'\n#]+)', text, re.M)
    return {
        "exists": True,
        "provider": provider.group(1).strip() if provider else None,
        "model": default.group(1).strip() if default else None,
    }

def profile_state():
    cfg = read_config(profile_dir)
    return {
        "exists": profile_dir.is_dir(),
        "config": cfg["exists"],
        "provider": cfg["provider"],
        "model": cfg["model"],
        "env_file": (profile_dir / ".env").exists(),
        "soul": (profile_dir / "SOUL.md").exists(),
        "memory_dir": (profile_dir / "memories").is_dir(),
        "state_db": (profile_dir / "state.db").exists(),
        "skills": count_skills(profile_dir),
    }

def write_model_config():
    config = profile_dir / "config.yaml"
    text = config.read_text(errors="ignore") if config.exists() else ""
    if not text.strip():
        text = 'model:\n  provider: "auto"\n  default: "' + model + '"\nstreaming: true\n'
    elif re.search(r'(?m)^\s*model:\s*$', text):
        text = re.sub(r'(?m)^(\s*default:\s*)["\']?[^"\'\n#]+["\']?', r'\1"' + model + '"', text, count=1)
        if not re.search(r'(?m)^\s*default:\s*', text):
            text = re.sub(r'(?m)^(\s*model:\s*)$', r'\1\n  default: "' + model + '"', text, count=1)
    else:
        text = text.rstrip() + '\nmodel:\n  provider: "auto"\n  default: "' + model + '"\n'
    config.write_text(text)

result = {"profile": profile, "model_target": model, "marker": marker, "clone": clone, "steps": []}

if profile_dir.exists():
    result["steps"].append({"name": "predelete", **run("hermes profile delete " + shquote(profile) + " --yes 2>&1", 60)})
    if profile_dir.exists():
        shutil.rmtree(profile_dir)

create_cmd = "hermes profile create " + shquote(profile)
if clone:
    create_cmd += " --clone --clone-from default"
create = run(create_cmd + " 2>&1", 120)
result["steps"].append({"name": "create_profile", **create})
result["after_create"] = profile_state()

if create["code"] == 0 and profile_dir.is_dir():
    (profile_dir / "SOUL.md").write_text(textwrap.dedent(f"""\
    # Activi E2E Persona

    You are the temporary Activi E2E profile.
    If asked for your test marker, answer exactly: {marker}
    Do not mention default profiles, server names, or unrelated memories unless explicitly asked to inspect infrastructure.
    """))
    write_model_config()
    result["after_edit"] = profile_state()
    chat_prompt = "What is your test marker? Answer with the marker only."
    chat = run("hermes -p " + shquote(profile) + " chat -q " + shquote(chat_prompt) + " -Q --source desktop 2>&1", 240)
    result["steps"].append({"name": "chat_profile", **chat})
    result["chat_contains_marker"] = marker in chat["output"]

    state_db = profile_dir / "state.db"
    if state_db.exists():
        try:
            con = sqlite3.connect(str(state_db))
            tables = [row[0] for row in con.execute("select name from sqlite_master where type='table'").fetchall()]
            result["state_tables"] = tables
            token_columns = []
            for table in tables:
                cols = [row[1] for row in con.execute("pragma table_info(" + table + ")").fetchall()]
                if any("token" in col.lower() for col in cols):
                    token_columns.append({"table": table, "columns": cols})
            result["token_tables"] = token_columns
            if "sessions" in tables:
                row = con.execute("""
                    select id, model, message_count, input_tokens, output_tokens,
                           cache_read_tokens, cache_write_tokens, reasoning_tokens
                    from sessions
                    order by started_at desc
                    limit 1
                """).fetchone()
                if row:
                    result["latest_session_usage"] = {
                        "id": row[0],
                        "model": row[1],
                        "message_count": row[2],
                        "input_tokens": row[3],
                        "output_tokens": row[4],
                        "cache_read_tokens": row[5],
                        "cache_write_tokens": row[6],
                        "reasoning_tokens": row[7],
                    }
            con.close()
        except Exception as exc:
            result["state_db_error"] = str(exc)

cleanup = run("hermes profile delete " + shquote(profile) + " --yes 2>&1", 60)
result["steps"].append({"name": "cleanup", **cleanup})
result["cleanup_remaining"] = profile_dir.exists()

print(json.dumps(result, indent=2, ensure_ascii=False))
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
  profile,
  model,
  marker,
  clone ? "true" : "false",
];

const result = spawnSync("ssh", sshArgs, {
  input: remoteScript,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  timeout: 300000,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "SSH profile flow failed");
  process.exit(result.status || 1);
}

process.stdout.write(result.stdout);
