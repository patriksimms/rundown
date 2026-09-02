import { MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '#/components/ui/button';

// The stored value only exists once the visitor has toggled at least once;
// until then the inline script in __root.tsx follows the OS preference. The
// same script re-applies the stored choice before hydration on later visits,
// so toggling here never causes a flash of the wrong theme.
export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  };
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Toggle dark mode" onClick={toggle}>
      {/* Both icons render and CSS picks one, so the server needs no theme
          state and hydration can never mismatch. */}
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
