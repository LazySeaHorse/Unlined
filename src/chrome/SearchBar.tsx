import { Search, X } from 'lucide-react';
import { foundCount, useSearchMatches } from '@/canvas/useSearch';
import { cn } from '@/lib/cn';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { IconButton } from '@/ui/Button';

/** Search field that lives in the top bar: a quiet button until opened, then an input. */
export function SearchBar() {
  const { searchOpen, searchQuery, openSearch, closeSearch, setSearchQuery } = useUiStore();
  const nodes = useCanvasStore((s) => s.nodes);
  const matches = useSearchMatches(nodes);

  if (!searchOpen) {
    return (
      <button
        type="button"
        aria-label="Search"
        onClick={openSearch}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-muted transition-colors hover:text-fg xl:w-48"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left whitespace-nowrap xl:inline">Search nodes</span>
      </button>
    );
  }

  return (
    <div className={cn('flex h-9 items-center gap-1 rounded-full border border-accent bg-surface pl-3')}>
      <Search className="size-4 shrink-0 text-accent" />
      <input
        // biome-ignore lint/a11y/noAutofocus: opening search is an explicit user action.
        autoFocus
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
        placeholder="Search nodes…"
        aria-label="Search nodes"
        className="w-32 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-muted xl:w-40"
      />
      {matches && (
        <span className="text-xs whitespace-nowrap text-muted tabular-nums">
          {foundCount(nodes, matches)} found
        </span>
      )}
      <IconButton icon={X} label="Close search" hint="Esc" size="sm" onClick={closeSearch} />
    </div>
  );
}
