import { describe, expect, it } from "vitest";

import { memoryNoteKey, memoryNoteParts, memoryNotes, withMemoryNote, withoutMemoryNote } from "./memory-notes";

const doc = "# Notes\n- Omkar uses Resolve Studio\n* Likes short replies\nplain line\n  - nested one\n";

describe("the notes in MEMORY.md", () => {
  it("are its bullet lines, each with the line it sits on", () => {
    expect(memoryNotes(doc)).toEqual([
      { line: 1, text: "Omkar uses Resolve Studio" }, { line: 2, text: "Likes short replies" }, { line: 4, text: "nested one" },
    ]);
    expect(memoryNotes("")).toEqual([]);
  });

  it("forget one line and leave every other byte alone", () => {
    expect(withoutMemoryNote(doc, 2)).toBe("# Notes\n- Omkar uses Resolve Studio\nplain line\n  - nested one\n");
    expect(withoutMemoryNote(doc, 3), "a line that is not a note is never removed").toBe(doc);
    expect(withoutMemoryNote(doc, 99)).toBe(doc);
  });

  it("add a note as one bullet at the end, on its own line", () => {
    expect(withMemoryNote(doc, "  Prefers the free version ")).toBe(`${doc}- Prefers the free version\n`);
    expect(withMemoryNote("", "First")).toBe("- First\n");
    expect(withMemoryNote("# Notes", "Two\nlines")).toBe("# Notes\n- Two lines\n");
  });
});

describe("memoryNoteParts", () => {
  it("takes the date and source off a dated note and keeps its text", () => {
    expect(memoryNoteParts('2026-11-04 · from chat "change your name to Kara, you will be my chief …" · This bot is named Kara (set 2026-11-04).'))
      .toEqual({ date: "2026-11-04", source: 'chat "change your name to Kara, you will be my chief …"', body: "This bot is named Kara (set 2026-11-04).", inactive: false });
  });

  it("drops trailing upkeep marks and strike-through, and reads a note with no source", () => {
    expect(memoryNoteParts("2026-11-04 · ~~Akbar uses Postgres~~ · superseded 2026-11-05", "2026-11-05")).toEqual({ date: "2026-11-04", source: null, body: "Akbar uses Postgres", inactive: true });
    expect(memoryNoteParts("2026-11-04 · from tidy-up · Timezone is WIB · until 2026-12-01", "2026-11-05")).toEqual({ date: "2026-11-04", source: "tidy-up", body: "Timezone is WIB", inactive: false });
  });

  it("marks a note past its until date inactive, as the server stops reading it", () => {
    expect(memoryNoteParts("2026-10-01 · from chat · In Bali this week · until 2026-10-08", "2026-11-05").inactive).toBe(true);
    expect(memoryNoteParts("2026-10-01 · from chat · In Bali this week · until 2026-11-05", "2026-11-05").inactive).toBe(false);
    expect(memoryNoteParts("2026-10-01 · from chat · See the brief · until 2026-01-15 for the numbers", "2026-11-05").inactive, "an until date with words after it is part of the text").toBe(false);
  });

  it("leaves a hand-written note as it is", () => {
    expect(memoryNoteParts("Likes short replies · mostly")).toEqual({ date: null, source: null, body: "Likes short replies · mostly", inactive: false });
  });
});

describe("memoryNoteKey", () => {
  it("changes when a reload puts another note on the same line", () => {
    const before = memoryNoteKey({ path: "MEMORY.md", line: 2, text: "Likes tea" });
    expect(memoryNoteKey({ path: "MEMORY.md", line: 2, text: "New note" })).not.toBe(before);
    expect(memoryNoteKey({ path: "MEMORY.md", line: 2, text: "Likes tea" })).toBe(before);
  });
});
