// One-time setup for the one-push pipeline (double-click START-HERE.bat). Safe to run again: finished steps are skipped.
// Sets the GitHub secrets/variables the pipeline needs (Supabase connection, Cloudflare key),
// then prints the few browser-only steps. Secrets are typed hidden and never printed.
// Everything runs on free plans: one Cloudflare Worker (frontend + API, database through Hyperdrive) + Supabase.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createInterface as createInterfaceCb } from "node:readline";
import { ensureGhLogin } from "./gh-login.mjs";
import { setCloudflareSecrets } from "./cloudflare-token.mjs";

const out = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const ok = (c) => { try { out(c); return true; } catch { return false; } };
const interactive = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts }).status === 0;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = "") => ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def);
const step = (n, t) => console.log(`\n=== ${n}. ${t}`);
const setSecret = (name, value) => execSync(`gh secret set ${name}`, { input: value, stdio: ["pipe", "ignore", "inherit"] });
/** Typed input that shows * instead of the characters. */
function askHidden(q) {
  return new Promise((resolve) => {
    const r = createInterfaceCb({ input: process.stdin, output: process.stdout, terminal: true });
    r._writeToOutput = (t) => { if (t.includes(q)) r.output.write(t); else if (!/[\r\n]/.test(t)) r.output.write("*"); };
    r.question(q, (a) => { r.close(); process.stdout.write("\n"); resolve(a.trim()); });
  });
}

// The Cloudflare key typed in this run (used once to work out the live workers.dev address; never saved here).
let cf = null;

// 1. Tools
step(1, "Tools");
if (!ok("git --version")) { console.error("Install Git for Windows, then run START-HERE.bat again."); process.exit(1); }
if (!ok("gh --version")) {
  console.log("Installing GitHub CLI ...");
  interactive("winget", ["install", "--id", "GitHub.cli", "-e", "--accept-source-agreements", "--accept-package-agreements"]);
  console.log("\nGitHub CLI installed. CLOSE this window and double-click START-HERE.bat again (Windows needs a new window to find it).");
  process.exit(0);
}
ensureGhLogin();
const repo = out("gh repo view --json nameWithOwner --jq .nameWithOwner");
console.log("Repository: " + repo);

// 2. Supabase connection (GitHub secret SUPABASE_DB_URL: used for migrations and for the Worker's Hyperdrive)
step(2, "Supabase connection");
const secrets = ok("gh secret list") ? out("gh secret list --json name --jq \".[].name\"").split(/\s+/) : [];
const vars0 = ok("gh variable list") ? out("gh variable list --json name --jq \".[].name\"").split(/\s+/) : [];
const env = {};
if (existsSync("backend/.env")) { // written by the old Spring setup; still a handy source if it is there
  for (const line of readFileSync("backend/.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1].toUpperCase().replace(/[.\-]/g, "_")] = m[2].replace(/^["']|["']$/g, "");
  }
}
let dbUrl = "";
let ref = "";
let hostPort = "";
let dbUser = "";
if (secrets.includes("SUPABASE_DB_URL") && vars0.includes("VITE_SUPABASE_URL")) {
  const url = out("gh variable get VITE_SUPABASE_URL");
  ref = (url.match(/^https:\/\/(\w+)\.supabase\.co/) || [])[1] || "";
  console.log(`Already set (secret SUPABASE_DB_URL, variable VITE_SUPABASE_URL = ${url}).`);
} else {
  const jdbc = env.DB_URL || env.SPRING_DATASOURCE_URL || "";
  dbUser = env.DB_USERNAME || env.SPRING_DATASOURCE_USERNAME || "";
  const dbPass = env.DB_PASSWORD || env.SPRING_DATASOURCE_PASSWORD || "";
  hostPort = (jdbc.match(/^jdbc:postgresql:\/\/([^/?]+)/) || [])[1] || "";
  if (hostPort && dbUser && dbPass) {
    dbUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPass)}@${hostPort.includes(":") ? hostPort : hostPort + ":5432"}/postgres?sslmode=require`;
    console.log("Using the Supabase connection from backend/.env.");
  } else {
    console.log(`Use a Supabase project of its own for this CRM (not the SM ERP or Corporate CRM one: their tables and
  migration history would clash). Supabase > New project, region Mumbai (ap-south-1).
  Then Supabase > that project > Connect (top) > "Session pooler" > copy the connection string
  (postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres).`);
    for (;;) {
      const uri = (await ask("Paste the Session pooler connection string")).replace(/^["']|["']$/g, "");
      const m = uri.match(/^postgres(?:ql)?:\/\/([^:@\/]+)(?::[^@]*)?@([^\/?]+)\/?(\w*)/);
      if (!m || !/^postgres\.\w+$/.test(m[1])) { console.log("That is not a Supabase Session pooler string (user must be postgres.<ref>). Try again."); continue; }
      rl.pause();
      const pass = await askHidden("Database password (Supabase > Project Settings > Database; hidden): ");
      rl.resume();
      dbUser = m[1];
      hostPort = m[2];
      dbUrl = `postgresql://${dbUser}:${encodeURIComponent(pass)}@${hostPort.includes(":") ? hostPort : hostPort + ":5432"}/${m[3] || "postgres"}?sslmode=require`;
      break;
    }
  }
  ref = (dbUser.match(/^postgres\.(\w+)$/) || [])[1] || "";
}
const supabaseUrl = ref ? `https://${ref}.supabase.co` : "";
if (supabaseUrl) console.log(`Supabase project: ${ref}  (${supabaseUrl})`);

// 3. GitHub: workflow permissions, secrets, variables
step(3, "GitHub settings");
ok(`gh api -X PUT repos/${repo}/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=false`);
if (dbUrl) {
  setSecret("SUPABASE_DB_URL", dbUrl);
  console.log("Set secret SUPABASE_DB_URL");
}
if (!secrets.includes("CLOUDFLARE_ACCOUNT_ID") || !secrets.includes("CLOUDFLARE_API_TOKEN")) {
  // Cleans the paste and checks it with Cloudflare before saving (a bad token only failed later, in deploy step 5).
  rl.pause();
  cf = await setCloudflareSecrets();
  if (!cf) process.exit(1);
  rl.resume();
}
const vars = ok("gh variable list") ? out("gh variable list --json name --jq \".[].name\"").split(/\s+/) : [];
if (!vars.includes("APP_URL")) {
  // The Worker's address is https://sm-hbd-crm.<your workers.dev subdomain>.workers.dev - asked from Cloudflare when we can.
  let appUrl = "";
  if (cf) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/workers/subdomain`, { headers: { Authorization: `Bearer ${cf.token}` } });
      const sub = (await r.json())?.result?.subdomain;
      if (sub) appUrl = `https://sm-hbd-crm.${sub}.workers.dev`;
    } catch {}
  }
  if (appUrl) console.log("Live URL will be " + appUrl);
  else appUrl = (await ask("Live URL of SM HBD CRM (Cloudflare > Workers & Pages > right side 'Subdomain': https://sm-hbd-crm.<subdomain>.workers.dev)")).replace(/\/+$/, "");
  execSync(`gh variable set APP_URL --body "${appUrl}"`, { stdio: "inherit" });
}
if (!vars.includes("VITE_SUPABASE_URL") && supabaseUrl) execSync(`gh variable set VITE_SUPABASE_URL --body "${supabaseUrl}"`, { stdio: "inherit" });
if (!vars.includes("VITE_SUPABASE_ANON_KEY")) {
  console.log("Supabase > Project Settings > API Keys > copy the anon / publishable key (it is meant for browsers, not secret).");
  const key = await ask("Paste the anon / publishable key");
  execSync(`gh variable set VITE_SUPABASE_ANON_KEY --body "${key}"`, { stdio: "inherit" });
}

console.log("The database connection for the live API (Cloudflare Hyperdrive \"sm-hbd-crm-db\") is made by the pipeline from SUPABASE_DB_URL.");

// 4. PROJECT.md values
step(4, "PROJECT.md");
if (existsSync("PROJECT.md")) {
  let p = readFileSync("PROJECT.md", "utf8");
  const appUrl = ok("gh variable get APP_URL") ? out("gh variable get APP_URL") : "";
  p = p.replace(/^- Live URL: .*$/m, `- Live URL: ${appUrl}`);
  if (ref) p = p.replace(/^- Supabase project ref: .*$/m, `- Supabase project ref: ${ref}   region: ap-south-1   URL: ${supabaseUrl}`);
  if (hostPort) p = p.replace(/^- DB pooler host: .*$/m, `- DB pooler host: ${hostPort.split(":")[0]}   user: ${dbUser}`);
  writeFileSync("PROJECT.md", p);
  console.log("PROJECT.md updated.");
}
let gitEmail = "";
try { gitEmail = out("git config user.email"); } catch {}
const loginEmail = await ask("The email you will log in to SM HBD CRM with (becomes the first ADMIN)", gitEmail);
rl.close();

console.log(`
============================================================
 Almost done. Do these in the browser (once), then double-click SHIP.bat:

 1. Cloudflare > Workers & Pages > sm-hbd-crm > Settings > Build: DISCONNECT the Git repository
    (the pipeline deploys now; a second deployer would race it).
 2. Supabase > Project Settings > Integrations > GitHub: disconnect if it is connected.
 3. Supabase > Project Settings > JWT Keys: the current signing key must be ECC (P-256).
    If it still shows "Legacy JWT secret", click "Migrate JWT secret", then "Rotate keys".
 4. Supabase > Authentication > URL Configuration:
      Site URL: your live URL      Redirect URLs: <live URL>/**  and  http://localhost:3000/**
 5. Supabase > Authentication > Users > Add user > your email + a password, tick "Auto Confirm User".

 Then SHIP.bat. When it prints LIVE, open Supabase > SQL Editor and run (makes you ADMIN):
   insert into public.user_roles (user_id, role)
   select id, 'ADMIN' from auth.users where email = '${loginEmail.replace(/'/g, "''")}'
   on conflict (user_id) do update set role = 'ADMIN';
 Log in on the live URL. In Staff mapping, put each person's work email on their row
 (Incharge / Team decides what they see) and add the accounts team emails; "Create login"
 there makes their password once STAFF-LOGINS-KEY.bat has been run.
============================================================`);
