/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Declares the env vars this app reads, so `import.meta.env` is typed rather than `any`.
 *  `VITE_SERVER_URL` points the client at a deployed multiplayer server; unset, the client
 *  falls back to the local dev server (see useOnlineGame.ts). */
interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
