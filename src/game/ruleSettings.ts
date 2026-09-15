import { DEFAULT_CONFIG } from '../../shared/engine/config.ts';
import type { Config } from '../../shared/engine/types.ts';

const KEY = 'euchre-rules';

export type RuleSettings = Config['lonerTiersEnabled'];

const DEFAULT_RULE_SETTINGS: RuleSettings = DEFAULT_CONFIG.lonerTiersEnabled;

/** Same shape/pattern as `audioSettings.ts`: localStorage rather than React state, since
 *  `useGame` needs to read this from a plain function call at game-start time, not just from
 *  a component. Same on-disk shape as `Config['lonerTiersEnabled']` on purpose — this IS that
 *  field, persisted; `useGame` merges it into `DEFAULT_CONFIG` to build each new game's config. */
export function getRuleSettings(): RuleSettings {
  // Guarded end to end: `getItem` throws where site data is blocked, and this is read when every
  // game starts and every online table is joined.
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_RULE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_RULE_SETTINGS;
  } catch {
    return DEFAULT_RULE_SETTINGS;
  }
}

export function setRuleSettings(next: RuleSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Unwritable storage: the change can't persist past this page.
  }
}
