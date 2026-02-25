#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseColor, rgbToHex, rgbToHsl, formatRgb, formatHsl, alphaComposite } from "./colors.js";
import { contrastRatioWithAlpha, contrastRatio, checkWCAG, suggestAccessibleColor } from "./contrast.js";

const server = new McpServer({
  name: "contrast-checker",
  version: "1.0.0",
});

// Tool 1: check_contrast
server.tool(
  "check_contrast",
  "Check the contrast ratio between two colors and evaluate WCAG 2.1 compliance. " +
    "Accepts hex (#fff, #ffffff), rgb(r,g,b), hsl(h,s%,l%), and CSS named colors.",
  {
    foreground: z.string().describe("Foreground color (e.g. '#333', 'rgb(0,0,0)', 'navy')"),
    background: z.string().describe("Background color (e.g. '#fff', 'rgb(255,255,255)', 'white')"),
  },
  async ({ foreground, background }) => {
    const fg = parseColor(foreground);
    const bg = parseColor(background);

    if (!fg) {
      return {
        content: [{ type: "text", text: `Error: Could not parse foreground color "${foreground}"` }],
        isError: true,
      };
    }
    if (!bg) {
      return {
        content: [{ type: "text", text: `Error: Could not parse background color "${background}"` }],
        isError: true,
      };
    }

    // Alpha-composite the foreground onto the background (like WebAIM's RGBAtoRGB)
    const { ratio, effectiveFg } = contrastRatioWithAlpha(fg, bg);
    const wcag = checkWCAG(ratio);

    const result: Record<string, unknown> = {
      contrast_ratio: `${wcag.ratio}:1`,
      foreground: {
        hex: rgbToHex(fg),
        rgb: formatRgb(fg),
        hsl: formatHsl(rgbToHsl(fg)),
        ...(fg.a < 1 ? { alpha: Math.round(fg.a * 100) / 100 } : {}),
      },
      background: {
        hex: rgbToHex(bg),
        rgb: formatRgb(bg),
        hsl: formatHsl(rgbToHsl(bg)),
      },
      ...(fg.a < 1
        ? {
            effective_foreground: {
              hex: rgbToHex(effectiveFg),
              rgb: formatRgb(effectiveFg),
              note: `Foreground with alpha ${Math.round(fg.a * 100) / 100} composited onto background`,
            },
          }
        : {}),
      wcag: {
        AA_normal_text: wcag.AA_normal ? "Pass" : "Fail",
        AA_large_text: wcag.AA_large ? "Pass" : "Fail",
        AAA_normal_text: wcag.AAA_normal ? "Pass" : "Fail",
        AAA_large_text: wcag.AAA_large ? "Pass" : "Fail",
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 2: suggest_accessible_color
server.tool(
  "suggest_accessible_color",
  "Suggest a replacement color that meets a WCAG contrast target. " +
    "Adjusts lightness while preserving hue and saturation to stay as close to the original as possible.",
  {
    foreground: z.string().describe("Foreground color"),
    background: z.string().describe("Background color"),
    target_level: z
      .enum(["AA", "AAA"])
      .default("AA")
      .describe("WCAG target level (default: AA)"),
    fix: z
      .enum(["foreground", "background"])
      .default("foreground")
      .describe("Which color to adjust (default: foreground)"),
  },
  async ({ foreground, background, target_level, fix }) => {
    const fg = parseColor(foreground);
    const bg = parseColor(background);

    if (!fg) {
      return {
        content: [{ type: "text", text: `Error: Could not parse foreground color "${foreground}"` }],
        isError: true,
      };
    }
    if (!bg) {
      return {
        content: [{ type: "text", text: `Error: Could not parse background color "${background}"` }],
        isError: true,
      };
    }

    // Composite foreground alpha onto background for contrast computation
    const effectiveFg = alphaComposite(fg, bg);
    const originalRatio = contrastRatio(effectiveFg, bg);
    const threshold = target_level === "AAA" ? 7.0 : 4.5;

    if (originalRatio >= threshold) {
      const wcag = checkWCAG(originalRatio);
      const result = {
        message: `Colors already meet WCAG ${target_level} (ratio: ${wcag.ratio}:1)`,
        original: {
          foreground: rgbToHex(fg),
          background: rgbToHex(bg),
        },
        suggestion: null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Suggest based on effective (composited) colors — suggestion is always opaque
    const suggested = suggestAccessibleColor(effectiveFg, bg, target_level, fix);
    const newRatio = fix === "foreground"
      ? contrastRatio(suggested, bg)
      : contrastRatio(effectiveFg, suggested);
    const newWcag = checkWCAG(newRatio);
    const origWcag = checkWCAG(originalRatio);

    const result = {
      original: {
        foreground: rgbToHex(fg),
        background: rgbToHex(bg),
        ...(fg.a < 1 ? { foreground_alpha: fg.a, effective_foreground: rgbToHex(effectiveFg) } : {}),
        contrast_ratio: `${origWcag.ratio}:1`,
      },
      suggestion: {
        [fix]: {
          hex: rgbToHex(suggested),
          rgb: formatRgb(suggested),
          hsl: formatHsl(rgbToHsl(suggested)),
        },
        new_contrast_ratio: `${newWcag.ratio}:1`,
        meets_target: newRatio >= threshold,
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 3: parse_color
server.tool(
  "parse_color",
  "Parse a color string and return it in hex, rgb, and hsl formats. " +
    "Accepts hex (#fff, #ffffff), rgb(r,g,b), hsl(h,s%,l%), and CSS named colors.",
  {
    color: z.string().describe("Color to parse (e.g. '#ff6600', 'rgb(255,102,0)', 'tomato')"),
  },
  async ({ color }) => {
    const parsed = parseColor(color);

    if (!parsed) {
      return {
        content: [{ type: "text", text: `Error: Could not parse color "${color}"` }],
        isError: true,
      };
    }

    const hsl = rgbToHsl(parsed);

    const result = {
      hex: rgbToHex(parsed),
      rgb: formatRgb(parsed),
      hsl: formatHsl(hsl),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
