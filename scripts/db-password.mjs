// DB-PASSWORD.bat: saves the Supabase database connection in GitHub ONLY after this computer has logged in to the
// database with it, then starts a new pipeline run. Fixes step 4 "password authentication failed" / "Tenant or user
// not found" without guessing. The password is typed hidden and never printed.
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { ensureGhLogin } from "./gh-login.mjs";

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const out = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const r = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) r._writeToOutput = (t) => { if (t.includes(q)) r.output.write(t); else if (!/[\r\n]/.test(t)) r.output.write("*"); };
    r.question(q, (a) => { r.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

ensureGhLogin();
if (!existsSync("cloudflare/node_modules/postgres")) {
  console.log("Installing the database driver once (about a minute) ...");
  execSync("npm install --no-audit --no-fund --loglevel=error", { cwd: "cloudflare", stdio: "inherit" });
}
const postgres = createRequire(import.meta.url)("../cloudflare/node_modules/postgres");

let ref = "";
try { ref = (out("gh variable get VITE_SUPABASE_URL").match(/^https:\/\/(\w+)\.supabase\.co/) || [])[1] || ""; } catch {}
console.log(`
Supabase > this CRM's project > Connect (top) > "Session pooler": copy the connection string
(postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres).`);
let user = "", host = "";
for (;;) {
  const s = (await ask("Paste the Session pooler string: ")).replace(/^["']|["']$/g, "");
  const m = s.match(/^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@([^:/?]+)/);
  if (m && /^postgres\.\w+$/.test(m[1]) && /pooler\.supabase\.com$/.test(m[2])) { user = m[1]; host = m[2]; break; }
  console.log("That is not a Session pooler string (user postgres.<ref>, host ...pooler.supabase.com). Try again.");
}
if (ref && user !== `postgres.${ref}`) {
  console.log(`Note: this string is for project ${user.slice(9)}, but the app's login uses project ${ref}. Use the same project for both.`);
}
console.log("If you do not know the password: Supabase > Project Settings > Database > Reset database password (letters and digits only).");

for (let tries = 1; tries <= 3; tries++) {
  const pass = await ask("Database password (hidden): ", true);
  if (!pass) continue;
  const url = `postgresql://${user}:${encodeURIComponent(pass)}@${host}:5432/postgres?sslmode=require`;
  process.stdout.write("Logging in to the database from this computer ... ");
  const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
  try {
    await sql`select 1`;
    console.log("OK");
  } catch (e) {
    const msg = String(e?.message || e);
    console.log("NOT OK\n  " + msg);
    if (/Tenant or user not found/i.test(msg)) console.log("  The pooler address is wrong: copy the Session pooler string again from Connect (aws-0 / aws-1 matters).");
    else if (/password authentication failed/i.test(msg)) console.log("  Wrong password. Reset it in Supabase (letters and digits only), wait a minute, try again.");
    await sql.end({ timeout: 1 }).catch(() => {});
    continue;
  }
  await sql.end({ timeout: 1 }).catch(() => {});
  execSync("gh secret set SUPABASE_DB_URL", { input: url, stdio: ["pipe", "ignore", "inherit"] });
  console.log("Saved GitHub secret SUPABASE_DB_URL (checked against the database first).");
  // A new run of main, watched to the end.
  const before = new Set(out('gh run list --workflow ship.yml --limit 20 --json databaseId --jq ".[].databaseId"').split(/\s+/).filter(Boolean));
  execSync("gh workflow run ship.yml --ref main", { stdio: "inherit" });
  let id = "";
  for (let i = 0; i < 30 && !id; i++) {
    sleep(4000);
    id = out('gh run list --workflow ship.yml --limit 20 --json databaseId --jq ".[].databaseId"').split(/\s+/).find((x) => x && !before.has(x)) || "";
  }
  if (!id) { console.log("Run started; follow it in GitHub > Actions."); process.exit(0); }
  const r = spawnSync("gh", ["run", "watch", id, "--exit-status", "--interval", "10"], { stdio: "inherit", shell: true });
  if (r.status === 0) { console.log("\n✅ LIVE."); process.exit(0); }
  console.error("\n❌ Failed. Last lines of the failed step:");
  spawnSync(`gh run view ${id} --log-failed`, { shell: true, stdio: "inherit" });
  process.exit(1);
}
console.log("Nothing saved after 3 tries.");
process.exit(1);
