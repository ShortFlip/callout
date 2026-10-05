'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { THEMES, getSavedTheme, applyTheme, type ThemeId } from '@/lib/theme';
import { SECTION_LABEL } from '@/lib/label';

export function ThemePicker() {
  const [current, setCurrent] = useState<ThemeId>('midnight');

  useEffect(() => {
    // Read localStorage after mount on purpose: reading it in the useState
    // initializer would render a different theme on the server vs client and
    // trigger a hydration mismatch. This is the one legit setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(getSavedTheme());
  }, []);

  function handleSelect(id: ThemeId) {
    setCurrent(id);
    applyTheme(id);
  }

  return (
    <div className="space-y-2">
      <p className={SECTION_LABEL}>Theme</p>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => handleSelect(theme.id)}
            className="relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors hover:border-primary"
            style={{
              borderColor: current === theme.id ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            {/* Color swatch */}
            <div
              className="w-10 h-10 rounded-full border border-black/10"
              style={{ background: `linear-gradient(135deg, ${theme.bg} 60%, ${theme.accent})` }}
            />
            <span className="text-[13px] text-muted-foreground">{theme.label}</span>

            {/* Selected checkmark */}
            {current === theme.id && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
