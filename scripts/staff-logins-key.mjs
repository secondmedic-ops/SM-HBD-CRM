// STAFF-LOGINS-KEY.bat: lets Staff mapping make new logins (Create login) and set passwords.
// Asks (hidden) for the Supabase secret key, checks it with Supabase's Auth admin API first, saves it as the GitHub secret
// SUPABASE_SERVICE_ROLE_KEY (the pipeline hands it to the Worker as a secret) and starts a deploy. Nothing secret is
// printed, and the key never goes into git, the browser or the chat. Free: no paid service involved.
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { ensureGhLogin } from "./gh-login.mjs";

const out = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function askHidden(q) {
  return new Promise((resolve) => {
    const r = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    r._writeToOutput = (t) => { if (t.includes(q)) r.output.write(t); else if (!/[\r\n]/.test(t)) r.output.write("*"); };
    r.question(q, (a) => { r.close(); process.stdout.write("\n"); resolve(a.trim()); });
  });
}
/** Keeps only the key from a messy paste (spaces, quotes, "Bearer ..."). */
const cleanKey = (s) => (String(s || "").match(/(sb_secret_[A-Za-z0-9_\-]{10,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/) || [""])[0];

ensureGhLogin();
let url = "";
try { url = out("gh variable get VITE_SUPABASE_URL").replace(/\/+$/, ""); } catch {}
if (!url) { console.error("GitHub variable VITE_SUPABASE_URL is missing: run START-HERE.bat first."); process.exit(1); }
console.log(`Supabase project: ${url}`);
console.log("Open Supabase > Project Settings > API Keys > Secret keys (or the legacy service_role key) and copy it.");
console.log("It is a master key: paste it only here, never in a chat, an e-mail or the browser app.\n");
for (let tries = 0; tries < 3; tries++) {
  const key = cleanKey(await askHidden("Supabase secret key (hidden): "));
  if (!key) { console.log("That does not look like a Supabase secret key (sb_secret_... or eyJ...). Try again."); continue; }
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  let status = 0;
  try { status = (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers })).status; } catch (e) { console.log("No connection to Supabase: " + e.message); }
  if (status !== 200) { console.log(`Supabase did not accept this key (HTTP ${status}). Copy the SECRET key, not the publishable / anon key.`); continue; }
  execSync("gh secret set SUPABASE_SERVICE_ROLE_KEY", { input: key, stdio: ["pipe", "ignore", "inherit"] });
  console.log("Saved as GitHub secret SUPABASE_SERVICE_ROLE_KEY.");
  try { execSync("gh workflow run ship.yml --ref main", { stdio: "ignore" }); console.log("Deploy started: Create login in Staff mapping works in about 5 minutes."); }
  catch { console.log("Run SHIP.bat once so the live app gets the key."); }
  process.exit(0);
}
console.log("Nothing saved.");
process.exit(1);
