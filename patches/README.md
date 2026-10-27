# Patches

Applied to `node_modules` by `patch-package` on every install (`postinstall`). Vite resolves `mathlive` to
the unminified `mathlive.mjs` in every mode (see `vite.config.ts`), so that is the one file patched.

## mathlive

- **Caret into an empty argument.** `MathModeEditor.insert` meant to put the caret inside a command's
  empty argument but selected one offset too far, taking in the whole command. `\hat` committed from LaTeX
  mode then lost its argument: the next key replaced the accent or landed beside it. Parentheses (`left...right`) keep the old selection: the smart fence fills the new
  fence from the atom at the caret, and with the caret elsewhere typing `(` threw and left the field dead.
- **Balanced drag selection.** `extendSelectionTo` only grew a drag to whole fractions, scripts and accents,
  so a drag across a square root, parentheses or integral limits ended at a different depth than it began,
  highlighting and copying only part of the math. `balanceRange` lifts both ends to the same branch; ends
  on different lines of a multi-line field stay on their lines.
- **A drag past the edge of a line.** `offsetFromPoint` sent any point right (or left) of the math to the
  end (or start) of the whole field, so in a multi-line field a drag just past the end of a line selected
  every line below it. `lineEdgeFromPoint` stops it at the end of the line nearest the pointer.
- **Subscripts and superscripts under the pointer.** A script draws no box of its own, so
  `nearestAtomFromPointRecursive` skipped it and a drag over `p_3` stopped short of the `3`.
  `nearestChildFromPoint` looks inside it.
- **Copying across lines.** `Model.getValue` serialized a range as one flat list of atoms, so math copied
  from several lines of a multi-line field came out on one line. `serializeLines` keeps the lines, as
  `\displaylines{a\\ b}`.
- **Pasting lines.** A copy across lines carried MathLive's own atom list too, which paste prefers and
  which knows no lines, so it pasted on one line. `onCopy` leaves it out then, and the LaTeX is pasted
  instead, where a pasted `\displaylines` replaced the whole field. `insertLines` splits the line at the
  caret around the pasted lines, or, with the caret deeper than a line (or one line pasted), pastes their
  contents inline. It returns the atoms it pasted, so `insert` places the caret after them as for any paste.
- **Backspace between cells.** Backspace at the start of a cell (or Delete at its end) only joined the
  lines of a one-column field, did nothing in `aligned` and the like, and at the start of a field's first
  line deleted that line. `joinCells` replaces `deleteRow` there: it joins the cell to
  the one before (or after), as deleting the `&` would, and a line's first cell to the line above, cell by
  cell. In a matrix, where cells are separate entries, it steps into the neighbouring cell instead.

When upgrading MathLive, re-apply these by hand to the new `mathlive.mjs` and run `npx patch-package mathlive`.
