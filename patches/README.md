# Patches

Applied to `node_modules` by `patch-package` on every install (`postinstall`). Vite resolves `mathlive` to
the unminified `mathlive.mjs` in every mode (see `vite.config.ts`), so that is the one file patched.

## mathlive

- **Caret into an empty argument.** `ModeEditor.insert` meant to put the caret inside a command's empty
  argument but selected one offset too far, taking in the whole command. `\hat` committed from LaTeX mode
  then lost its argument: the next key replaced the accent or landed beside it.
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

When upgrading MathLive, re-apply these by hand to the new `mathlive.mjs` and run `npx patch-package mathlive`.
