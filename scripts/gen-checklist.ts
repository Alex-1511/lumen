// Generates docs/CAPABILITIES.md from data/registry.json so the checklist can never drift from the code-linked registry.
import { readFileSync, writeFileSync } from "fs";
const reg: { name: string; status: string; impl: string | null; note: string }[] = JSON.parse(readFileSync("data/registry.json", "utf8"));
const order = ["implemented", "partial", "ai-assisted", "experimental", "planned", "unsupported"];
const blurb: Record<string, string> = {
  implemented: "Works, tested, and does what the name says.",
  partial: "Works, but narrower than the full technique. The note says exactly what is missing.",
  "ai-assisted": "Needs the server-side Gemini call. Results depend on the model.",
  experimental: "Heuristic. Can be wrong; labelled as such in the UI.",
  planned: "Feasible, not built.",
  unsupported: "Not built and not scheduled. Listed in the glossary only.",
};
let md = `# Capability checklist\n\nGenerated from \`data/registry.json\` by \`scripts/gen-checklist.ts\` (${reg.length} glossary terms). Do not edit by hand; edit the rules in \`scripts/build-registry.ts\`.\n\n`;
md += "| Status | Count |\n|---|---|\n" + order.map((s) => `| ${s} | ${reg.filter((r) => r.status === s).length} |`).join("\n") + "\n\n";
for (const s of order) {
  const rows = reg.filter((r) => r.status === s); md += `## ${s} (${rows.length})\n\n${blurb[s]}\n\n`;
  if (s === "unsupported") { md += `${rows.length} terms from the glossary have no implementation. They are intentionally not listed one by one here; see \`/capabilities\` in the app for the searchable list.\n\n`; continue; }
  for (const r of rows) md += `- [${s === "implemented" ? "x" : " "}] **${r.name}**${r.impl ? ` (\`${r.impl}\`)` : ""}${r.note ? ": " + r.note : ""}\n`;
  md += "\n";
}
writeFileSync("docs/CAPABILITIES.md", md); console.log("wrote docs/CAPABILITIES.md", reg.length);
