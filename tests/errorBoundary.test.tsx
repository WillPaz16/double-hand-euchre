/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/ui/ErrorBoundary.tsx';

afterEach(cleanup);

function Boom(): never {
  throw new Error('render crash');
}

describe('ErrorBoundary', () => {
  it('replaces a crashed tree with a recovery screen instead of a blank page', () => {
    // React logs caught render errors; silence it so the test output stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    spy.mockRestore();
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>the game</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('the game')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
