import { nodeKinds, nodeSpecs } from '@/nodes/catalog';
import { SYNTAX } from '@/nodes/syntax';

/** Primer returned by get_guide. One plain-text document. */
export function buildGuide(): string {
  const kinds = nodeKinds.map((k) => `- ${k}: ${nodeSpecs[k].description}.`).join('\n');
  return `Unlined guide for AI agents

WHAT IT IS
Unlined is an infinite canvas of free nodes. The user can link the nodes with arrows. The node kinds are notes,
math, graphs, tables, spreadsheets, scripts, images, videos, web pages and PDFs. You work on the one canvas that is
open in the user's tab.

NODE KINDS
${kinds}

FIELDS (create_nodes takes them flat next to "kind"; update_nodes "set" replaces them)
- text: markdown. ${SYNTAX.text}
- math: latex. It is typeset only.
- mathPlus: latex. ${SYNTAX.mathPlus} Each Math+ node has its own scope. Other nodes cannot see the variables and
  functions that it defines, even when linked. Only a link can carry a value to another node (see below). The app
  evaluates nodes in reading order (top to bottom, then left to right). A node waits for the nodes that link into it.
  read_nodes shows the result of each line after ⟶.
  A link from one Math+ node to another gives the exact result of the last line of the source to the target as a
  variable. If the label of the link is one latin letter (not e or i), such as "k" or "$k$", the variable has that
  name. Otherwise the variable is "ans". The target reads it as it reads any variable (k*2+1). read_nodes shows it as
  "inputs: k = 5 (from n2)". The app evaluates the source first, also when the source is below the target.
  A source passes nothing in these cases: it has an error, it has no lines, or its last line defines a function
  (f(x) := ...). Then the lines of the target that use the name fail. Two links with the same name into one node fail
  only if that node uses the name. If the target assigns the name itself (k := 3), its own value wins from that line
  on. Links can form loops. The app breaks a loop at its node that is first in reading order and ignores the link
  from the loop there ("loop: link ignored"). Links that touch other kinds of node carry nothing.
- graph: equations, a list of rows {latex, color, name}. Each row is plotted on one grid in its colour (a section
  colour name). If you omit the colour, the app gives a free one. The name is optional. It is a short label for the line
  (text; $math$ is allowed). The user sees it written along y= and x= curves and beside points, and in the hover
  chip. ${SYNTAX.graph}
- table: cells, rows of LaTeX math cells.
- sheet: cells, rows of spreadsheet cells; ${SYNTAX.sheet}
- code: source, JavaScript. run_code runs it in a sandbox and returns the console output and the last value.
- video: url, a YouTube or Vimeo link or an https embed URL.
- web: url, the address of a live web page that the user can browse in the node. The node follows the user's
  navigation, so read_nodes shows where the user is now. You see only the address, not the page.
- section: title and color (yellow, green, blue, purple, pink, orange or gray). A section is a visible titled box that
  the user drew around nodes. When the user moves a section, the nodes inside move with it. When the user deletes a
  section, the nodes stay. You can rename, recolour, move, resize and delete sections. You cannot create them.
  Sections are not groups.
- image: the user uploads it. You can move, resize or delete images. You cannot create them and you cannot see them.
- stack: several nodes that the user put on one spot behind tabs. The app shows one at a time. The cards of a stack
  are ordinary nodes. You read and edit them by their own handles. Their place is the place of the stack
  ("in stack s3"). When you move or resize a card, you move or resize its stack. When you delete the stack, you
  delete its cards. You cannot create stacks. The user can pin a stack open ("pinned open in a row", a column or
  masonry). Then it shows every card at its own size, and it is as big as the user makes it. A resize has an effect
  only after the stack is behind tabs again.
- pdf: a PDF that the user linked from the disk. It shows the pages that the user pinned. While no page is pinned,
  it shows its cover (page 1). read_nodes gives you the text of the shown pages only. You cannot see the other pages.
  If read_nodes says that the file is not connected, ask the user to click Reconnect on the node. You cannot create
  pdf nodes and you cannot change which pages they show. You can only move, delete or retitle them.

Every kind except section and stack also takes an optional title and an optional color. The title is a name that the
user sees on the node. The color is a background tint from the section palette. Nodes without a color are plain
white. Keep them white (see COLOUR).

LINKS
- A link joins one node to another. It is an orthogonal line. By default it has an arrow at the "to" end. It can have a
  label (text; $...$ is typeset as math), a colour (the section palette, or "auto"), a dashed line, and a head and a
  tail (arrow, dot, bar, none). You can link sections as you link nodes.
- Links are mostly visual. They show how nodes relate ("derived from", "see also"). The one exception is a link
  between two Math+ nodes, which passes a value (see mathPlus above).
- link_nodes draws links. If a link in the same direction between the same two nodes exists, you get an error. A link
  in the other direction is allowed. list_links lists links, update_links changes their look or reverses them, and
  delete_links removes them. read_nodes shows the links of each node as "Links: -> n5 "k"; <- n2". When you delete a
  node, its links go with it.
- Link handles are l1, l2, ...

DERIVATIONS AND WORKED SOLUTIONS
Use these rules to turn a derivation, a proof or a worked problem into nodes. The source can be a photo, notes or
your own working.
- Make one logical step in each node. A step is one substitution, one expansion, one collection of terms or one
  rearrangement. If you must say "and then" to describe a node, split it. A node can show the 2 to 4 lines of one step
  (before, after, result). It must not show several steps. Use mathPlus when the user may want values or checks.
  Otherwise use math.
- Link each step to the step that uses it. The flow goes from top to bottom. Put each step below the step that it
  follows. A branch (cases, parallel sub-derivations) goes out to the right. Join the branches again in the step that
  uses all of them. If a later step uses an old result, link from the node that derived it. Do not copy it.
- Give each standard equation (a definition, a law or a formula that the derivation uses but does not prove) its own
  small node. Link it into the first step that uses it with a magenta link.
- Make flow links blue. Do not add a label when the algebra shows the step. Add a short label (a few words, for
  example "Substitute I_R2 into KVL 2") only when the two nodes do not show why the next step follows.
- Titles are allowed. A title can be long and specific, such as "Step 2: Eliminate I_R2 to isolate I_C".
- If the user gives you an image or a PDF of the source, leave it where it is as the reference. Order the nodes by
  dependency, not by the layout of the page. The page can have several steps on one line. Put each step in its own node.
- Check each step against the step before it, then continue. If the source has an error or a missing step, tell the
  user in your reply. Do not correct it silently.

COLOUR
Nodes are white by default. Keep them white. Add a tint only when the tint carries a meaning that nothing else can
carry. Example: an assumption and a result, or two parallel cases. Do not tint to decorate, to mark phases or to
copy the colours of the source. If you tint a node, you must be able to say what the tint means. Give the same tint to
every other node with that meaning. The same rule applies to links: blue for flow and magenta for a standard equation
in use. Send these as color "blue" and "magenta"; do not rely on "auto". Do not colour other links.

LAYOUT
- Coordinates are canvas pixels. x increases to the right and y increases downward. A position is the top-left corner.
- Groups are nearby nodes. The app recomputes them from the positions each time you read. A handle such as g2 stays
  the same while the group keeps most of its nodes. The user cannot see groups.
- Let the app place new nodes (near, group), unless you need an exact layout. Keep related nodes together.
- For a sequence of steps, create the nodes one after the other with near set to the previous node and side set to
  "below". For a branch, set side to "right".

HANDLES
Nodes are n1, n2, ..., groups are g1, g2, ... and links are l1, l2, ... for this session. Full ids also work.

WORKFLOW
1. Call get_overview (small, fixed size) for the counts, the groups and the selection. "This" or "these" usually
   means the selection.
2. Call list_nodes for a group, an area, the selection or what is on screen. Call search_nodes to find text.
3. Call read_nodes only for the nodes that you need in full.
4. To edit, prefer update_nodes edits (exact find and replace) or cells. Do not send whole fields again.
   Put related changes in one call. Each write call is one undo step for the user.
5. Call focus_nodes to show the user what you changed. Call undo if a change was wrong.

The user sees your edits live. The user cannot edit while you work. If a call fails, read its error. The error says
what to change.`;
}
