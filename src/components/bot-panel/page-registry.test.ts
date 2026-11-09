import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import { BOT_SECTIONS } from "../bot-settings/sections";
import { isSimplePage, PAGE_IDS, PAGES, sectionTarget, SIMPLE_PAGES } from "./page-registry";

describe("the bot panel's page registry", () => {
  it("lands every settings section on the panel's page or on a Simple page", () => {
    for (const { id } of BOT_SECTIONS) {
      const target = sectionTarget(id);
      if (target.page) expect(isSimplePage(target.page), id).toBe(true);
    }
  });

  it.each([
    ["overview", {}], ["identity", {}],
    ["soul", { page: "settings", anchor: "instructions", editInstructions: true }],
    ["skills", { page: "skills" }], ["memory", { page: "memory" }], ["routines", { page: "routines" }],
    ["library", { anchor: "keeps" }], ["access", { anchor: "computer" }], ["model", { anchor: "model" }],
    ["permissions", { page: "settings", anchor: "approval" }],
    ["voice", {}], ["visibility", {}], ["history", {}], ["usage", {}], ["slack", {}],
  ] as const)("sends a %s link to %o", (section, target) => {
    expect(sectionTarget(section)).toEqual(target);
  });

  it("draws the computer popup's Data and Files, and Activity, as Simple pages", () => {
    expect(SIMPLE_PAGES).toEqual(["settings", "apps", "backups", "botapi", "routines", "visibility", "memory", "skills", "folder", "browser", "where", "data", "files", "activity"]);
    expect(isSimplePage("mcp")).toBe(false);
  });

  it("names every page and its intro in English copy", () => {
    const keys = en as Record<string, string>;
    for (const id of PAGE_IDS) {
      expect(keys[PAGES[id].title], id).toBeTruthy();
      if (PAGES[id].intro) expect(keys[PAGES[id].intro], id).toBeTruthy();
    }
    expect(keys[PAGES.settings.title]).toBe("Bot settings");
    expect(keys[PAGES.data.title]).toBe("Data");
    expect(keys[PAGES.backups.intro!]).toContain("Used only when {name}'s AI is at its usage limit");
  });
});
