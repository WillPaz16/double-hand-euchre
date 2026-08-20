import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
// Self-hosted (via @fontsource, no CDN fetch), so it works offline once the PWA is installed.
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
