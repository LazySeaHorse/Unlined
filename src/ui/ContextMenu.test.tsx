import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { ContextMenu } from './ContextMenu';
import type { MenuEntry } from './Menu';

const setup = (items: MenuEntry[], at: { x: number; y: number } | null = { x: 40, y: 50 }) => {
  const onClose = vi.fn();
  renderUi(<ContextMenu at={at} items={items} onClose={onClose} />);
  return onClose;
};

describe('ContextMenu', () => {
  it('opens at a point and runs the chosen item', async () => {
    const onSelect = vi.fn();
    const onClose = setup([
      { label: 'Copy', hint: 'Ctrl+C', onSelect },
      { separator: true },
      { heading: 'More' },
    ]);
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByText('Ctrl+C')).toBeTruthy();
    await userEvent.click(screen.getByRole('menuitem', { name: /Copy/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows submenus', async () => {
    const onSelect = vi.fn();
    setup([{ label: 'Add node', items: [{ label: 'Text', onSelect }] }]);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Add node/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('opens a submenu on click, not on hover', async () => {
    setup([{ label: 'Add node', items: [{ label: 'Text', onSelect: () => {} }] }]);
    await userEvent.hover(await screen.findByRole('menuitem', { name: /Add node/ }));
    expect(screen.queryByRole('menuitem', { name: 'Text' })).toBeNull();
  });

  const deep: MenuEntry[] = [
    { label: 'One', items: [{ label: 'Two', items: [{ label: 'Three', onSelect: () => {} }] }] },
  ];

  it('goes back one level at a time with Escape, then closes', async () => {
    const onClose = setup(deep);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'One' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Two' }));
    expect(await screen.findByRole('menuitem', { name: 'Three' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Three' })).toBeNull());
    expect(screen.getByRole('menuitem', { name: 'Two' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Two' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('goes back from the header, and a click on the dimmed level only goes back', async () => {
    const onSelect = vi.fn();
    const onClose = setup([{ label: 'One', items: [{ label: 'Two', onSelect }] }]);
    const one = await screen.findByRole('menuitem', { name: 'One' });
    await userEvent.click(one);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Two' })).toBeNull());

    await userEvent.click(screen.getByRole('menuitem', { name: 'One' }));
    await screen.findByRole('menuitem', { name: 'Two' });
    await userEvent.click(document.querySelector('button[aria-hidden]') as Element);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Two' })).toBeNull());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves between levels with the arrow keys', async () => {
    setup(deep);
    (await screen.findByRole('menuitem', { name: 'One' })).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Two' })));
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Two' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'One' }));
  });

  it('stays closed without a point', () => {
    setup([{ label: 'Copy', onSelect: () => {} }], null);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', async () => {
    const onClose = setup([{ label: 'Copy', onSelect: () => {} }]);
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
