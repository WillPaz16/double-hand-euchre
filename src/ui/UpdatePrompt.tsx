import { useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** How often an open tab asks whether a new version has been deployed. A game can sit open for
 *  an evening, and without a periodic check it would only ever learn about a deploy on reload. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Offers a reload when a new version is ready, instead of swapping it in silently.
 *
 *  The service worker used to auto-update, which in practice meant a deploy reached a player only
 *  after they closed the game or reloaded twice — and in the meantime an old client could be
 *  talking to a newer multiplayer server. Now the new version installs in the background and this
 *  bar says so; the player picks the moment, so nothing reloads under them mid-trick. Reloading is
 *  safe either way: the solo game autosaves and an online seat is reclaimed on reconnect.
 *
 *  Mounted in main.tsx, outside <App>, so it shows on every screen and the build-only
 *  `virtual:pwa-register` module never has to be resolvable in unit tests that render the app. */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      setInterval(() => {
        // Skip while offline: the check would just fail, and offline play is a supported mode.
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

  // Two cases, and `updateServiceWorker` alone only handles one. A page the service worker
  // already controls gets a WAITING new worker: hand over, and the plugin reloads once it takes
  // control. But on a first visit the page loaded before any worker existed, so nothing controls
  // it — a new version then activates at once with nothing waiting, and `updateServiceWorker`
  // waits forever for a handover that never comes. Measured: Reload did nothing there. A plain
  // reload is correct in that case, because the new version is already the active one.
  const reload = () => {
    if (registrationRef.current?.waiting) void updateServiceWorker(true);
    else window.location.reload();
  };

  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status" aria-live="polite">
      <span>A new version is ready.</span>
      <button className="update-bar-button" onClick={reload}>
        Reload
      </button>
      <button className="update-bar-later" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
