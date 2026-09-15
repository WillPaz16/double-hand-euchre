/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineGame } from '../src/net/useOnlineGame.ts';

/** A stand-in socket the test drives by hand: it records what the client sends and lets the test
 *  deliver server messages exactly when it wants. */
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  deliver(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('server messages a client does not recognise', () => {
  it('are ignored — even before seating they do not refuse the connection', () => {
    const { result } = renderHook(() => useOnlineGame('TRUK'));
    const socket = FakeSocket.instances.at(-1)!;
    act(() => socket.open());
    expect(result.current.status).toBe('connected');

    // A message type from some future server, arriving before `seated`.
    act(() => socket.deliver({ t: 'some_future_message', payload: 1 }));
    expect(result.current.status).toBe('connected');
    expect(result.current.notice).toBeNull();
    expect(socket.readyState).toBe(FakeSocket.OPEN);
  });

  it('a real rejection before seating is still terminal', () => {
    const { result } = renderHook(() => useOnlineGame('TRUK'));
    const socket = FakeSocket.instances.at(-1)!;
    act(() => socket.open());
    act(() => socket.deliver({ t: 'rejected', reason: 'That room already has two players.' }));
    expect(result.current.status).toBe('refused');
    expect(result.current.notice).toBe('That room already has two players.');
  });
});
