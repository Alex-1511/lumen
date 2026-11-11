// Generative edit boundary with a mocked network.
process.env.GEMINI_API_KEY = "AIza-test-key-not-real-0000000000000000"; delete process.env.GEMINI_IMAGE_MODEL;
import { callGeminiImage } from "../lib/gemini";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const reply = (s: number, b: any) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
(async () => {
  let n = 0; globalThis.fetch = (async (_u: any, init: any) => { n++; const b = JSON.parse(init.body); if (n === 1) return reply(503, { error: { message: "overloaded" } }); return reply(200, { candidates: [{ content: { parts: [{ text: "done" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }] } }], _sent: b.generationConfig }); }) as any;
  let r: any = await callGeminiImage([{ text: "x" }]); ok("503 is retried then the image is returned", r.ok && r.data === "QUJD" && r.mime === "image/png" && n === 2);
  n = 0; globalThis.fetch = (async () => { n++; return reply(200, { candidates: [{ content: { parts: [{ text: "I can't edit that image." }] } }] }); }) as any;
  r = await callGeminiImage([{ text: "x" }]); ok("a text-only (refusal) reply is an error that quotes the model and is not retried", !r.ok && r.status === 422 && /can't edit/.test(r.error) && n === 1);
  n = 0; globalThis.fetch = (async () => { n++; return reply(401, { error: { message: "API key not valid" } }); }) as any;
  r = await callGeminiImage([{ text: "x" }]); ok("a rejected key is not retried", !r.ok && n === 1 && /rejected the key/.test(r.error));
  let sent: any; globalThis.fetch = (async (_u: any, init: any) => { sent = JSON.parse(init.body); return reply(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "QQ==" } }] } }] }); }) as any;
  r = await callGeminiImage([{ text: "x" }]); ok("requests IMAGE output", sent.generationConfig.responseModalities.includes("IMAGE") && r.ok);
  globalThis.fetch = (async () => { throw new Error("network must not be called"); }) as any; delete process.env.GEMINI_API_KEY; process.chdir(require("node:os").tmpdir());
  r = await callGeminiImage([{ text: "x" }]); ok("no key gives the setup message without calling the network", !r.ok && r.status === 503 && /Settings/.test(r.error));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
