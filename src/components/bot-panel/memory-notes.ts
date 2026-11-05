import { MEMORY_INDEX, type MemoryDoc } from "@/lib/memory";

/** The bullet lines of MEMORY.md, each with the line it sits on so one can be taken out again. */
export interface MemoryNote {
  line: number;
  text: string;
}

const BULLET = /^\s*[-*]\s+(.+?)\s*$/;

export function memoryNotes(text: string): MemoryNote[] {
  return text.split("\n").flatMap((raw, line) => {
    const note = BULLET.exec(raw)?.[1];
    return note ? [{ line, text: note }] : [];
  });
}

export function withoutMemoryNote(text: string, line: number): string {
  const lines = text.split("\n");
  if (!BULLET.test(lines[line] ?? "")) return text;
  lines.splice(line, 1);
  return lines.join("\n");
}

export function withMemoryNote(text: string, note: string): string {
  const body = text.replace(/\s+$/, "");
  const bullet = `- ${note.trim().replace(/\s*\n\s*/g, " ")}`;
  return body ? `${body}\n${bullet}\n` : `${bullet}\n`;
}

/** A note of one file: a bullet of it, or, for a topic file without bullets, the whole file (`line` null). */
export interface PanelMemoryNote {
  path: string;
  line: number | null;
  text: string;
}

export function panelMemoryNotes(docs: readonly MemoryDoc[]): PanelMemoryNote[] {
  return docs.flatMap((doc): PanelMemoryNote[] => {
    const bullets = memoryNotes(doc.text).map((note) => ({ path: doc.path, ...note }));
    if (bullets.length || doc.path === MEMORY_INDEX) return bullets;
    const text = doc.text.split("\n").map((line) => line.replace(/^#+\s*/, "").trim()).filter(Boolean).join(" ");
    return text ? [{ path: doc.path, line: null, text }] : [];
  });
}

/** A note split per the server's entry grammar (`YYYY-MM-DD · from <source> · text`), so the panel shows the text alone. */
export interface MemoryNoteParts {
  body: string;
  date: string | null;
  source: string | null;
  inactive: boolean;
}

const DATED = /^(\d{4}-\d{2}-\d{2}) · (?:from ([^·\n]*?) · )?(.*)$/;
const TRAILING_MARKS = /(?: · (?:updated|confirmed|until|expired|superseded|moved) \d{4}-\d{2}-\d{2})+$/;

const UNTIL_MARK = / · until (\d{4}-\d{2}-\d{2})(?= · |$)/;
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export function memoryNoteParts(text: string, today = localDate()): MemoryNoteParts {
  const match = DATED.exec(text);
  if (!match) return { body: text, date: null, source: null, inactive: false };
  const rest = match[3];
  const struck = rest.startsWith("~~");
  const until = UNTIL_MARK.exec(rest)?.[1] ?? null;
  const body = rest.replace(TRAILING_MARKS, "").replace(/^~~/, "").replace(/~~$/, "").trim();
  return { body: body || text, date: match[1], source: match[2]?.trim() || null, inactive: struck || (until !== null && until < today) };
}

/** Keyed by text as well as line, so a reload that shifts lines closes the open note instead of showing another. */
export function memoryNoteKey(note: Pick<PanelMemoryNote, "path" | "line" | "text">): string {
  return `${note.path}:${note.line ?? "file"}:${note.text}`;
}
