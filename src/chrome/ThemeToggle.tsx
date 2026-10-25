import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { viewTransition } from '@/motion/viewTransition';
import { useUiStore } from '@/store/uiStore';
import { IconButton } from '@/ui/Button';

/** Applies the theme class to <html>. */
export function useThemeClass() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}

/** Switches theme with a crossfade, the class changing inside it so the browser sees the new look at once. */
function toggleTheme() {
  viewTransition(() => {
    useUiStore.getState().toggleTheme();
    document.documentElement.classList.toggle('dark', useUiStore.getState().theme === 'dark');
  });
}

export function ThemeToggle() {
  const dark = useUiStore((s) => s.theme === 'dark');
  return (
    <IconButton icon={dark ? Sun : Moon} label={dark ? 'Light mode' : 'Dark mode'} onClick={toggleTheme} />
  );
}
