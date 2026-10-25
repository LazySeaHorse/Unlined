import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';
import { OctoHero, type OctoHeroProps } from './OctoHero';

/** A mascot header drawn above the title. */
export type Hero = Omit<OctoHeroProps, 'className'>;

/** Horizontal padding of the header, body and footer when a hero is shown. */
const HERO_PX = 'px-[22px]';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Shown before the title, in the accent colour. */
  icon?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body. */
  footer?: ReactNode;
  /** `large` fills most of the window, for readers and editors. */
  size?: 'default' | 'large';
  /** Opens the popup with the mascot on a drawn canvas. */
  hero?: Hero;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = 'default',
  hero,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          // Radix focuses the first tabbable (the close chip) on open; let content opt in to a better target.
          onOpenAutoFocus={(event) => {
            const target =
              event.currentTarget instanceof HTMLElement
                ? event.currentTarget.querySelector<HTMLElement>('[data-autofocus]')
                : null;
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
          className={cn(
            'pop fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] border border-border bg-surface text-fg shadow-2xl',
            size === 'large' ? 'h-[92vh] max-w-6xl' : 'max-h-[85vh] max-w-md',
            className,
          )}
        >
          {hero && (
            <div className="relative shrink-0">
              <OctoHero {...hero} />
              <Dialog.Close asChild>
                <IconButton
                  icon={X}
                  label="Close"
                  size="sm"
                  round
                  className="absolute top-2.5 right-2.5 border border-border bg-surface"
                />
              </Dialog.Close>
            </div>
          )}
          <div
            className={cn(
              'flex items-start justify-between gap-3',
              hero ? `${HERO_PX} pt-1 pb-2` : 'bg-gradient-to-b from-surface-2 to-transparent px-6 pt-5 pb-3',
            )}
          >
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-xl leading-tight font-semibold tracking-[-0.015em]">
                {icon && <span className="text-accent [&>svg]:size-5">{icon}</span>}
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!hero && (
              <Dialog.Close asChild>
                <IconButton icon={X} label="Close" size="sm" />
              </Dialog.Close>
            )}
          </div>
          <div className={cn('min-h-0 overflow-y-auto pt-2 pb-5', hero ? HERO_PX : 'px-6')}>{children}</div>
          {footer && (
            <div
              className={cn(
                'flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 py-3.5',
                hero ? HERO_PX : 'px-6',
              )}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
