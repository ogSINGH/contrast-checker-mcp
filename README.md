# contrast-checker-mcp

An MCP server that provides color contrast checking tools for AI assistants. Verify WCAG 2.1 accessibility compliance, compute contrast ratios with alpha transparency support, and get accessible color suggestions — all via the standard [Model Context Protocol](https://modelcontextprotocol.io).

Contrast calculations match [WebAIM's contrast checker](https://webaim.org/resources/contrastchecker/) — including alpha compositing, WCAG `0.03928` sRGB threshold, and truncated (not rounded) ratios.

## Tools

### `check_contrast`

Check the contrast ratio between two colors and evaluate WCAG 2.1 compliance.

**Inputs:**
- `foreground` — Foreground color (e.g. `#333`, `rgb(0,0,0)`, `rgba(0,0,0,0.5)`, `navy`)
- `background` — Background color (e.g. `#fff`, `rgb(255,255,255)`, `white`)

**Output:** Contrast ratio, WCAG 2.1 pass/fail results (AA normal, AA large, AAA normal, AAA large), parsed color values. When the foreground has alpha, shows the effective composited color used for the calculation.

### `suggest_accessible_color`

Suggest a replacement color that meets a WCAG contrast target, keeping the hue as close to the original as possible.

**Inputs:**
- `foreground` — Foreground color
- `background` — Background color
- `target_level` — `"AA"` or `"AAA"` (default: `"AA"`)
- `fix` — `"foreground"` or `"background"` (default: `"foreground"`)

**Output:** A suggested replacement color (in hex, rgb, hsl) that meets the target level, along with the new contrast ratio.

### `parse_color`

Parse a color string and return it in multiple formats.

**Inputs:**
- `color` — Color to parse (e.g. `#ff6600`, `rgb(255,102,0)`, `tomato`)

**Output:** The color in hex, rgb, and hsl formats.

## Supported Color Formats

- Hex: `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa`
- RGB: `rgb(r, g, b)`, `rgba(r, g, b, a)`
- HSL: `hsl(h, s%, l%)`, `hsla(h, s%, l%, a)`
- CSS named colors: `red`, `cornflowerblue`, `rebeccapurple`, etc.

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "contrast-checker": {
      "command": "npx",
      "args": ["-y", "contrast-checker-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add contrast-checker npx -y contrast-checker-mcp
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "contrast-checker": {
      "command": "npx",
      "args": ["-y", "contrast-checker-mcp"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/ogSINGH/contrast-checker-mcp.git
cd contrast-checker-mcp
npm install
npm run build
node dist/index.js
```

## Examples

**Black on white** — 21:1 ratio, all WCAG levels pass:
```
check_contrast({ foreground: "#000000", background: "#ffffff" })
```

**Semi-transparent text** — alpha composited onto background before checking:
```
check_contrast({ foreground: "rgba(0,0,0,0.5)", background: "#ffffff" })
→ effective color #808080, ratio 3.94:1
```

**Fix a failing color pair:**
```
suggest_accessible_color({
  foreground: "#777777",
  background: "#ffffff",
  target_level: "AA"
})
→ suggests #757575 (4.61:1)
```

## License

Apache-2.0
