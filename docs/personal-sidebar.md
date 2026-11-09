# Personal sidebar order

The fork changes the order the desktop sidebar shows bots in. It saves
nothing new, and the server keeps its order routes. Read this before you
merge an upstream release tag that touches a file in the table below.

## Order

- **Pinned bots** keep upstream's order: the saved order, with working and
  waiting bots first (`activeBotsFirst`).
- **Every other bot list** (the main list and each department) shows the
  newest activity first: the bot's latest thread `updatedAt`, skipping
  archived and snoozed threads and routine runs (`newestBotsFirst`). Ties
  keep the saved order. The iOS home skips the same threads, and also counts
  a message that arrived before the thread's `updatedAt` caught up.
- **A department's chief** stays at the top of its department, as upstream
  draws it; only the department's other bots sort newest first.
- **Sections** keep upstream's drag order.

## Moving bots

The lists sort themselves, so a place inside a bot's own list would never
show. The drag controller refuses such a drop and shows no drop line for it.
It also refuses Alt+Up/Down, and the row no longer handles or advertises that
shortcut. Moving a bot into or out of a department still works, and so does
dropping one unsectioned bot on another to start a department. The icons-only
rail gets no bot drag, because it can only reorder inside a list.

## Files

| File | Fork change |
| --- | --- |
| `src/components/Sidebar.tsx` | Where the bot lists are built (`activeBotsFirst` for pinned, `newestBotsFirst` for the rest); `botDrag.arrange` is off in the rail; the bot row has no Alt+Up/Down. |
| `src/lib/sidebar-layout.ts` | `newestBotsFirst`. |
| `src/components/SidebarBotDrag.tsx` | `allowed` refuses a move inside the bot's own list; the row and zone drag-over show no line for one; `step` goes through `allowed`. |
| `src/components/Sidebar.departments.test.ts` | Tests the order and the refused moves. |

## Merging an upstream release

If upstream changes how the sidebar orders bots, or adds another way to
reorder a bot inside its list, keep the fork's rule: lists other than pinned
go newest first, and nothing reorders a bot inside its own list.
