import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { UpdatePrompt } from './ui/UpdatePrompt.tsx';
import { reportError } from './net/reportError.ts';
// Self-hosted (via @fontsource, no CDN fetch), so it works offline once the PWA is installed.
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './styles/index.css';

// The two ways an error escapes React entirely: a throw outside rendering (an event handler, a
// timer, the socket) and a rejected promise nobody caught. ErrorBoundary covers render errors; these
// cover the rest, so a bug does not depend on a player thinking to mention it.
window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window'));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promise'));

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <UpdatePrompt />
  </StrictMode>,
);
