// Gemini boundary with a mocked network: retries, fallback model, timeouts and non-retryable errors.
process.env.GEMINI_API_KEY = "AIza-test-key-not-real-0000000000000000"; delete process.env.GEMINI_MODEL;
import { callGemini } from "../lib/gemini";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const real = globalThis.fetch; const reply = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const good = reply.bind(null, 200, { candidates: [{ content: { parts: [{ text: '{"hello":"world"}' }] } }] });
const timeoutErr = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
(async () => {
  let calls: string[] = [];
  globalThis.fetch = (async (url: any) => { calls.push(String(url).split("/models/")[1].split(":")[0]); return calls.length === 1 ? reply(503, { error: { message: "The model is overloaded" } }) : good(); }) as any;
  let r: any = await callGemini([{ text: "x" }]); ok("503 overload is retried and then succeeds", r.ok && r.json.hello === "world", calls.join(" > ")); ok("the failed attempt is reported", r.attempts.length === 1 && /503/.test(r.attempts[0]));
  calls = []; globalThis.fetch = (async (url: any) => { calls.push(String(url).split("/models/")[1].split(":")[0]); if (calls.length <= 2) throw timeoutErr(); return good(); }) as any;
  r = await callGemini([{ text: "x" }], undefined, { timeoutMs: 50 }); ok("timeouts are retried (user's 'aborted due to timeout' case)", r.ok && calls.length === 3, calls.join(" > ")); ok("a fallback model is used after the primary times out", new Set(calls).size > 1);
  calls = []; globalThis.fetch = (async () => { calls.push("x"); throw timeoutErr(); }) as any;
  r = await callGemini([{ text: "x" }], undefined, { timeoutMs: 10, maxAttempts: 2 }); ok("persistent timeout returns a clear error after the allowed attempts", !r.ok && calls.length === 2 && /did not answer after 2 attempts/.test(r.error), r.error?.slice(0, 80));
  calls = []; globalThis.fetch = (async () => { calls.push("x"); return reply(401, { error: { message: "API key not valid" } }); }) as any;
  r = await callGemini([{ text: "x" }]); ok("a rejected key is NOT retried and says so", !r.ok && calls.length === 1 && /rejected the key/.test(r.error), r.error?.slice(0, 60));
  calls = []; globalThis.fetch = (async () => { calls.push("x"); return reply(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] }); }) as any;
  r = await callGemini([{ text: "x" }], undefined, { maxAttempts: 2 }); ok("non-JSON replies are retried then reported", !r.ok && calls.length === 2);
  globalThis.fetch = (async () => { throw new Error("network must not be called"); }) as any; delete process.env.GEMINI_API_KEY; process.chdir(require("node:os").tmpdir()); // no .lumen/gemini.json here
  r = await callGemini([{ text: "x" }]); ok("no key gives the setup message, no network call", !r.ok && r.status === 503 && /Settings/.test(r.error));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
