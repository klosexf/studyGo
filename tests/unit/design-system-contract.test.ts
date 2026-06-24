import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/app/globals.css"), "utf8");

function getRuleDeclarations(source: string, selector: string) {
  return getRuleDeclarationMatches(source, selector).at(0) ?? new Map();
}

function getLastRuleDeclarations(source: string, selector: string) {
  return getRuleDeclarationMatches(source, selector).at(-1) ?? new Map();
}

function hasRuleDeclaration(
  source: string,
  selector: string,
  property: string,
  value: string,
) {
  return getRuleDeclarationMatches(source, selector).some(
    (declarations) => declarations.get(property) === value,
  );
}

function getRuleDeclarationMatches(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = source.matchAll(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, "gm"),
  );

  return [...matches].map((match) =>
    new Map(
      match[1]
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => {
          const separator = declaration.indexOf(":");
          return [
            declaration.slice(0, separator).trim(),
            declaration.slice(separator + 1).trim(),
          ];
        }),
    ),
  );
}

describe("design system CSS contract", () => {
  const tokens = {
    canvas: "#f2f1ed",
    ivory: "#ffffff",
    charcoal: "#10131a",
    ink: "#20211f",
    muted: "#999a92",
    line: "#e5e3da",
    sage: "#e5eddd",
    yellow: "#ffe8b5",
    lavender: "#c5c0f7",
    "accent-yellow": "#ffc83d",
    "accent-purple": "#7268ff",
    danger: "#c86659",
  };

  it.each(Object.entries(tokens))("keeps --%s at %s", (name, value) => {
    expect(css).toMatch(
      new RegExp(`--${name}:\\s*${value.replace("#", "\\#")};`),
    );
  });

  it("uses the desktop three-column app shell", () => {
    expect(getRuleDeclarations(css, ".app-shell").get("grid-template-columns"))
      .toBe("360px minmax(0, 1fr) 440px");
  });

  it("does not override the app shell or hide insights for training pages", () => {
    expect(css).not.toMatch(
      /\.app-shell:has\(\.training-workspace\)\s*\{/,
    );
    expect(css).not.toMatch(
      /\.app-shell:has\(\.training-workspace\)\s+\.insights-rail\s*\{[^}]*display:\s*none/,
    );
  });

  it("uses the 1399px two-column breakpoint and moves the rail below main", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*1399px\)/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1399px\)\s*\{[\s\S]*?\.app-shell\s*\{[^}]*grid-template-columns:\s*250px minmax\(0,\s*1fr\);[^}]*\}[\s\S]*?\.insights-rail\s*\{[^}]*grid-column:\s*2;/,
    );
  });

  it("uses the 759px single-column breakpoint", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*759px\)/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*759px\)\s*\{[\s\S]*?\.app-shell\s*\{[^}]*display:\s*block;[^}]*\}[\s\S]*?\.app-main,\s*\.insights-rail\s*\{[^}]*width:\s*100%;/,
    );
  });

  it("does not globally reset native buttons or headings", () => {
    expect(getRuleDeclarations(css, "button").size).toBe(0);
    expect(getRuleDeclarations(css, "h1").size).toBe(0);
    expect(css).not.toMatch(/button,\s*a\s*\{/);
  });

  it("keeps horizontal overflow control on body rather than html", () => {
    expect(getRuleDeclarations(css, "html").has("overflow-x")).toBe(false);
    expect(getRuleDeclarations(css, "body").get("overflow-x")).toBe("hidden");
  });

  it("uses a low-specificity focus-visible accessibility rule", () => {
    expect(css).toMatch(/:where\([^)]*\)(?::focus-visible)?\s*\{/);
  });

  it("wraps unbroken history text without horizontal overflow", () => {
    expect(getRuleDeclarations(css, ".user-long-text").get("overflow-wrap"))
      .toBe("anywhere");
    expect(getRuleDeclarations(css, ".user-long-text").get("word-break"))
      .toBe("break-word");
  });

  it("keeps the training center panel on the compact visual scale", () => {
    expect(
      hasRuleDeclaration(
        css,
        ".training-topbar h1,\n.training-topbar__title",
        "font-size",
        "36px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-search input", "height", "56px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".training-workspace .stage-tabs ol",
        "min-width",
        "700px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".training-workspace .stage-tabs li > :where(button, span)",
        "min-height",
        "48px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".setup-card", "min-height", "460px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".setup-card .choice-card",
        "min-height",
        "160px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".recommendation-actions .ui-button",
        "min-height",
        "56px",
      ),
    ).toBe(true);
    expect(getLastRuleDeclarations(css, ".training-search input").get("height"))
      .toBe("50px");
  });

  it("keeps all training stages on one compact shared scale", () => {
    expect(
      hasRuleDeclaration(
        css,
        ".training-workspace",
        "grid-template-columns",
        "minmax(0, 1fr)",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-workspace > *", "min-width", "0"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-stage", "gap", "18px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-stage", "min-width", "0"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-topbar", "grid-template-columns", "1fr"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-heading h1", "font-size", "28px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-stage .ui-card", "padding", "18px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".training-stage .ui-card",
        "border-radius",
        "18px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".training-stage .ui-button", "min-height", "40px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".editor-field textarea", "min-height", "220px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".score-list > div", "padding", "8px 10px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".metric-grid .ui-card",
        "min-height",
        "116px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".training-workspace .stage-tabs--topic li > :where(button, span)",
        "min-height",
        "56px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(
        css,
        ".training-stage--topic .topic-card h2",
        "font-size",
        "28px",
      ),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".hint-header", "padding", "14px 18px"),
    ).toBe(true);
    expect(
      hasRuleDeclaration(css, ".hint-section", "padding", "12px 14px"),
    ).toBe(true);
  });
});
