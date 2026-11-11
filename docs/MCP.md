# Lumen MCP server

Lets an MCP client (Antigravity, Codex, Cowork / Claude, anything that speaks MCP over stdio) edit photos with Lumen's real pipeline.
It drives Lumen's `/headless` page in headless Chromium, so the result is the same per-pixel render the editor produces. No Gemini key is needed or exposed.

## Run it
1. Start Lumen: `npm run build && npm start` (default http://localhost:3000, or set `LUMEN_URL`).
2. One-time: `npm i` then `npx playwright install chromium`.
3. The client launches `npx tsx mcp/server.mts` for you (see configs below).

## Tools
| Tool | What it does |
|---|---|
| `lumen_status` | Checks Lumen is reachable. |
| `lumen_list_effects` | Lists 33 effects (Box/Gaussian/Mosaic Blur, Sharpen, Tilt-Shift, Bokeh, Cinematic, Vibrant...). |
| `lumen_capabilities` | Searches the 872-technique registry with honest statuses. |
| `lumen_analyze_image` | Exposure, clipping, saturation, noise, sharpness, subject box. |
| `lumen_edit_image` | Manual params, effects, offline text request, `auto`, retouch ops (clone, heal, spot, remove), export to JPEG/PNG/WebP/TIFF, SDR/HDR, 360p to 8K. Reports changed pixels and anything it could not do. |

## Client configs
These are the standard shapes. I could not test them inside Antigravity, Codex or Cowork from my sandbox, only with the official MCP client SDK (see `tests/mcp-client.mts`, 12 checks). If a client's menu differs, the command and args are what matter.

**Codex** (`~/.codex/config.toml`)
```toml
[mcp_servers.lumen]
command = "npx"
args = ["tsx", "mcp/server.mts"]
cwd = "/path/to/lumen"
env = { LUMEN_URL = "http://localhost:3000" }
```

**Antigravity** (Agent panel, Manage MCP Servers, View raw config)
```json
{ "mcpServers": { "lumen": { "command": "npx", "args": ["tsx", "/path/to/lumen/mcp/server.mts"], "env": { "LUMEN_URL": "http://localhost:3000" } } } }
```

**Cowork / Claude Desktop** (`claude_desktop_config.json`)
```json
{ "mcpServers": { "lumen": { "command": "npx", "args": ["tsx", "/path/to/lumen/mcp/server.mts"], "env": { "LUMEN_URL": "http://localhost:3000" } } } }
```

## Limits
- HDR is expanded from SDR, tagged BT.2020 + PQ, capped at 3840 px.
- Enlarging is Lanczos (sharp, no new detail). Not AI super-resolution.
- Generative fill is not available. Object removal copies patches from the same photo.
- Retouch coordinates are normalised 0..1 on the source image; `r` is a fraction of the long edge.

## Connect from inside the app
Open Lumen, click **Connect agent** (sidebar or Home). Pick Claude Code, Codex CLI, Antigravity, Claude Desktop or "any agent", press **Copy prompt** and paste it into that agent. The prompt contains the exact command and absolute path for your machine. The dot turns green only after the agent has really called a Lumen tool (the MCP server sends a heartbeat to `/api/mcp-info`, which only answers on localhost).

New in Session 5: `lut` (`cube` text or `gradient` id, `amount`) and `sharpen` (`off|screen|print`) job options for `lumen_edit_image`.
