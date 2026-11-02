import { Sparkles } from 'lucide-react';
import { useAgentStore } from '@/agent';
import { useAiAssist } from '@/ai/store';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/store/uiStore';
import { WithTooltip } from '@/ui/Button';

/**
 * Opens the AI panel. The dot shows whether any AI is on (AI control, or the model in the browser), and pulses
 * while an agent is editing right now.
 */
export function AiButton() {
  const open = useUiStore((s) => s.aiPanelOpen);
  const toggle = useUiStore((s) => s.toggleAiPanel);
  const enabled = useAgentStore((s) => s.enabled);
  const locked = useAgentStore((s) => s.locked);
  const onDevice = useAiAssist((s) => s.enabled);
  const on = enabled || onDevice;
  return (
    <WithTooltip label={`AI · ${on ? 'on' : 'off'}`}>
      <button
        type="button"
        aria-label="AI control"
        aria-pressed={open}
        onClick={toggle}
        className={cn(
          'flex h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm font-medium transition-colors',
          open ? 'bg-accent/15 text-accent' : 'text-fg hover:bg-accent/10 hover:text-accent',
        )}
      >
        <Sparkles className="size-[18px]" />
        <span className="hidden lg:inline">AI</span>
        <span
          className={cn('size-2 rounded-full', on ? 'bg-success' : 'bg-border', locked && 'animate-pulse')}
        />
      </button>
    </WithTooltip>
  );
}
