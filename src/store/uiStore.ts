import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NodeKind } from '@/model/types';

export type Theme = 'light' | 'dark';
export type AiTab = 'connect' | 'activity';

interface UiState {
  /** Node kind created by double-clicking the canvas. */
  tool: NodeKind;
  theme: Theme;
  searchOpen: boolean;
  searchQuery: string;
  aiPanelOpen: boolean;
  aiTab: AiTab;
  /** Linking mode: dragging from one node to another links them instead of moving. Never saved. */
  linking: boolean;
  /** The section whose title is open for editing, if any. */
  renamingSection: string | null;
  /** The node whose own title is open for editing, if any. */
  renamingNode: string | null;
  /** The link whose label is open for editing, if any. */
  renamingLink: string | null;
  /** The node that the nodes being dragged would stack onto if dropped now. */
  stackDropTarget: string | null;
  /** The stack whose cards are spread out to pick from, if any, and the card highlighted there. */
  fanned: string | null;
  fanFocus: number;
  setTool: (tool: NodeKind) => void;
  setLinking: (linking: boolean) => void;
  toggleTheme: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  toggleAiPanel: () => void;
  /** Opens the AI panel, optionally on a given tab. */
  openAiPanel: (tab?: AiTab) => void;
  setAiTab: (tab: AiTab) => void;
  renameSection: (id: string) => void;
  /** Closes the title editor of section `id`, unless another section has taken over since. */
  stopRenaming: (id: string) => void;
  renameNode: (id: string) => void;
  /** Closes the title editor of node `id`, unless another node has taken over since. */
  stopRenamingNode: (id: string) => void;
  renameLink: (id: string) => void;
  /** Closes the label editor of link `id`, unless another link has taken over since. */
  stopRenamingLink: (id: string) => void;
  setStackDropTarget: (id: string | null) => void;
  /** Spreads out the cards of stack `id`, highlighting card `focus` (by position). */
  openFan: (id: string, focus: number) => void;
  closeFan: () => void;
  setFanFocus: (focus: number) => void;
}

const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      tool: 'text',
      theme: systemTheme(),
      searchOpen: false,
      searchQuery: '',
      aiPanelOpen: false,
      aiTab: 'connect',
      linking: false,
      renamingSection: null,
      renamingNode: null,
      renamingLink: null,
      stackDropTarget: null,
      fanned: null,
      fanFocus: 0,
      // Picking a node to place ends linking, since a double-click on the canvas would otherwise do nothing.
      setTool: (tool) => set({ tool, linking: false }),
      setLinking: (linking) => set({ linking }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
      openAiPanel: (tab) => set((s) => ({ aiPanelOpen: true, aiTab: tab ?? s.aiTab })),
      setAiTab: (aiTab) => set({ aiTab }),
      renameSection: (id) => set({ renamingSection: id }),
      stopRenaming: (id) => set((s) => (s.renamingSection === id ? { renamingSection: null } : s)),
      renameNode: (id) => set({ renamingNode: id }),
      stopRenamingNode: (id) => set((s) => (s.renamingNode === id ? { renamingNode: null } : s)),
      renameLink: (id) => set({ renamingLink: id }),
      stopRenamingLink: (id) => set((s) => (s.renamingLink === id ? { renamingLink: null } : s)),
      openFan: (fanned, fanFocus) => set({ fanned, fanFocus }),
      closeFan: () => set((s) => (s.fanned ? { fanned: null } : s)),
      setFanFocus: (fanFocus) => set({ fanFocus }),
      setStackDropTarget: (stackDropTarget) =>
        set((s) => (s.stackDropTarget === stackDropTarget ? s : { stackDropTarget })),
    }),
    { name: 'unlined-ui', partialize: ({ tool, theme }) => ({ tool, theme }) },
  ),
);
