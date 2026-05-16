import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

function ThemeProbe() {
  const { setTheme, theme } = useTheme();
  return (
    <div>
      <output aria-label="theme">{theme}</output>
      <button type="button" onClick={() => setTheme('light')}>
        Light
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        Dark
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
  });

  it('defaults invalid or missing stored values to dark', () => {
    localStorage.setItem('es-theme', 'system');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('es-theme')).toBe('dark');
  });

  it('applies and persists light and dark selections', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('es-theme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('es-theme')).toBe('dark');
  });
});
