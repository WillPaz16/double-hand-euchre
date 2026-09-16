/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyLinkButton } from '../src/ui/CopyLinkButton.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CopyLinkButton', () => {
  it('copies an absolute join link for the room', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyLinkButton code="TRUK" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?room=TRUK`));
    await screen.findByRole('button', { name: 'Link copied' });
  });

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    // Clipboard access needs a secure context and can be blocked outright; the player still
    // needs the link.
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CopyLinkButton code="TRUK" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText(`${window.location.origin}/?room=TRUK`)).toBeTruthy();
  });
});
