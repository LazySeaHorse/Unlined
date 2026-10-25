import { nodeKinds, nodeSpecs } from '@/nodes/catalog';

/** Primer returned by get_guide. One plain-text document. */
export function buildGuide(): string {
  const kinds = nodeKinds.map((k) => `- ${k}: ${nodeSpecs[k].description}.`).join('\n');
  return `Unlined guide for AI agents

WHAT IT IS
Unlined is an infinite canvas of free-floating nodes, which the user can link with arrows: notes, math, graphs,
tables, spreadsheets, scripts, images, videos, web pages and PDFs. You work on the one canvas open in the user's tab.

NODE KINDS
${kinds}

FIELDS (create_nodes takes them flat next to "kind"; update_nodes "set" replaces them)
- text: markdown. Markdown with $inline$ and $$display$$ LaTeX.
- math: latex. Typeset only.
- mathPlus: latex. Each line (separated by \\\\) is evaluated; "a := 2" defines a variable that later Math+
  nodes can use. Math+ nodes are evaluated in reading order (top to bottom, then left to right), so position matters.
  read_nodes shows each line's result after ⟶.
  A link from one Math+ node to another hands the exact result of the source's last line to the target as a
  variable: named by the link's label when that is a single latin letter other than e and i ("k" or "$k$"), otherwise
  "ans". The target reads it like any variable (k*2+1) and read_nodes shows it as "inputs: k = 5 (from n2)". Linked
  nodes are evaluated source first, so a source below its target is evaluated earlier. A source with an error, no
  lines or a function definition (f(x) := ...) as its last line passes nothing and the target's lines that use
  the name fail. Two links with the same name into one node fail only if that node uses the name. If the target
  assigns the name itself (k := 3) its own value wins from that line on. Links can form loops (allowed): the loop
  is broken at its node earliest in reading order, whose link from the loop is ignored ("loop: link ignored"). Links touching other kinds of node carry nothing.
- graph: functions, a list of functions of x such as "x^2" or "\\sin(x)".
- table: cells, rows of LaTeX math cells.
- sheet: cells, rows of spreadsheet cells; formulas start with "=" and use A1 references (=SUM(A1:A3)).
- code: source, JavaScript. run_code runs it in a sandbox and returns console output and the last value.
- video: url, a YouTube/Vimeo link or https embed URL.
- web: url, the address of a live web page the user can browse in the node. It follows the user's navigation, so
  read_nodes shows where they are now. You see only the address, not the page.
- section: title and color (one of yellow, green, blue, purple, pink, orange, gray). A visible titled box the user
  drew around nodes. Moving a section moves the nodes inside it; deleting one keeps them. You can rename, recolour,
  move, resize and delete sections but not create them. They are separate from groups.
- image: uploaded by the user; you can move, resize or delete images but not create them or see them.
- stack: several nodes the user put on one spot behind tabs, one shown at a time. Its cards are ordinary nodes
  you read and edit by their own handles; their place is the stack's ("in stack s3"). Moving or resizing a card
  moves or resizes its stack; deleting the stack deletes its cards. You cannot create stacks. A stack the user
  pinned open ("pinned open in a row", a column or masonry) shows every card at its own size instead, and is as
  big as they make it: resizing it only takes effect once it is back behind tabs.

- pdf: a PDF the user linked from their disk. It shows the pages the user pinned, or its cover (page 1) while
  nothing is pinned. read_nodes gives you the text of the shown pages only; other pages are off limits and
  are never shown to you. If it says the file is not connected, ask the user to click Reconnect on the node.
  You cannot create pdf nodes or change what they show, only move, delete or retitle them.

Every kind but section and stack also takes an optional title, a name the user sees on the node, and an optional color
(the section palette), a background tint; untinted nodes are plain white.

LINKS
- A link joins one node to another: an orthogonal line with an arrow at the "to" end by default. It may have a label
  (text; $...$ is typeset as math), a colour (the section palette, or "auto"), a dashed line and a head and tail
  (arrow, dot, bar, none). Sections can be linked like any node.
- Links are mostly visual: they show how nodes relate ("derived from", "see also"). The one exception is between two
  Math+ nodes, which pass a value (see mathPlus above).
- link_nodes draws them (a link of the same direction between the same two nodes already exists = error; the other
  direction is fine), list_links lists them, update_links changes the look or reverses the direction, delete_links
  removes them. read_nodes shows each node's links as "Links: -> n5 "k"; <- n2". Deleting a node removes its links.
- Link handles are l1, l2, ...

LAYOUT
- Coordinates are canvas pixels; x grows right, y grows down. Positions are top-left corners.
- Groups are nearby nodes, recomputed from positions whenever you read. Handles like g2 stay stable while a group
  keeps most of its nodes. They are invisible to the user.
- Let the app place new nodes (near, group) unless you need an exact layout. Keep related nodes together.

HANDLES
Nodes are n1, n2, ..., groups g1, g2, ... and links l1, l2, ... for this session. Full ids also work.

WORKFLOW
1. get_overview (small, fixed size) for counts, groups and the selection. "This" or "these" usually means the selection.
2. list_nodes for a group, area, selection or what is on screen; search_nodes to find text.
3. read_nodes only for nodes you need in full.
4. Edit: prefer update_nodes edits (exact find/replace) or cells over resending whole fields.
   Batch related changes into one call: each write call is one undo step for the user.
5. focus_nodes to show the user what you changed. undo if a change was wrong.

The user sees your edits live and cannot edit while you are working. Read a failed call's error; it says what to change.`;
}
