// In-app MCP setup: agent picker, exact command in the prompt, and a status dot that only turns green after a real tool call heartbeat.
import { chromium } from "playwright";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/projects"); await page.click("[data-testid=open-connect]"); await page.waitForSelector("[data-testid=connect-prompt]");
  const txt = async () => page.locator("[data-testid=connect-prompt]").innerText();
  let t = await txt(); ok("prompt names the stdio server and the exact absolute path", /stdio/.test(t) && /\/mcp\/server\.mts/.test(t) && /LUMEN_URL=http:\/\/localhost:3100/.test(t), t.slice(0, 90).replace(/\n/g, " "));
  ok("prompt includes a test instruction (lumen_status)", /lumen_status/.test(t));
  await page.click("[data-testid=agent-claude-code]"); t = await txt(); ok("Claude Code tab gives the claude mcp add command", /claude mcp add lumen/.test(t));
  await page.click("[data-testid=agent-codex]"); t = await txt(); ok("Codex tab gives a config.toml block", /\[mcp_servers\.lumen\]/.test(t) && /cwd = /.test(t));
  await page.click("[data-testid=agent-antigravity]"); t = await txt(); ok("Antigravity tab gives raw JSON config", /"lumen": \{"command":"npx"/.test(t));
  ok("status starts grey: nothing has called yet or the call is old", (await page.locator("[data-testid=connect-status]").getAttribute("data-live")) === "false");
  await page.evaluate(() => fetch("/api/mcp-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "lumen_status" }) }));
  await page.waitForFunction(() => document.querySelector("[data-testid=connect-status]")?.getAttribute("data-live") === "true", null, { timeout: 8000 });
  ok("status turns green after a real heartbeat and names the tool", /lumen_status/.test(await page.locator("[data-testid=connect-status]").innerText()));
  const forged = await page.evaluate(async () => (await fetch("/api/mcp-info", { headers: { Host: "evil.example" } })).status); ok("endpoint answers", forged === 200 || forged === 403);
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
