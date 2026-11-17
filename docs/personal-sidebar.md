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
| `src/components/Sidebar.tsx` | Where the bot lists are built (`activeBotsFirst` for pinned, `newestBotsFirst` for the rest); `botDrag.arrange` is off in the rail; the bot row has no Alt+Up/Down. In Simple mode the row's ⋯ button and its provider mark sit at `right-2`, 28 px wide, and the name line keeps `pr-7`. A department line gets `count`. A selected bot or room row takes upstream's `rowSelectedSurface`, and no row rings the selected face, because the face already sweeps its own ring. Upstream's `SidebarBotThreadsPeek` (a hover list with New thread) is deleted with its tests: a bot has one chat. |
| `src/components/SidebarRowMarkers.tsx` | The unread dot sits at `right-2 top-1`, 28 px wide, in the same column as the ⋯ button and the provider mark. |
| `src/components/SidebarSectionHeader.tsx` | A closed department shows its row count in the ⋯ column (`count`), the chevron always shows before the name, and the ⋯ button sits at `right-2`, 28 px wide. The name takes upstream's 13/18 px, and upstream's single attention dot sits left of the count column. |
| `src/components/SidebarBotActivity.tsx` | `sidebarBotStatus` returns `running` beside upstream's `failed`; the row, tile, rail card, chat header and panel hero faces read `running`. |
| `src/components/SidebarRailCard.tsx` | The hover card says "Ran into a problem" in red for a bot whose last turn failed. |
| `src/lib/sidebar-layout.ts` | `newestBotsFirst`. |
| `src/components/SidebarBotDrag.tsx` | `allowed` refuses a move inside the bot's own list; the row and zone drag-over show no line for one; `step` goes through `allowed`. |
| `src/components/Sidebar.departments.test.ts` | Tests the order and the refused moves. |

## Merging an upstream release

If upstream changes how the sidebar orders bots, or adds another way to
reorder a bot inside its list, keep the fork's rule: lists other than pinned
go newest first, and nothing reorders a bot inside its own list.

If upstream moves a Simple-mode row's ⋯ button, unread dot or engine badge,
keep the three in the fork's column: `right-2`, 28 px wide. The last test in
`Sidebar.simple-mode.test.ts`'s bot row case fails when one of them drifts.

Upstream can drop a prop or a returned field the fork reads, in a line the
fork never edited, and the merge takes that with no conflict. After a merge,
check `count` at the `SidebarSectionHeader` call site and in its props, and
`running` in `sidebarBotStatus`. Keep the hover thread list out.
