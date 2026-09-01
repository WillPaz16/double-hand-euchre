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
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_RULE_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RULE_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_RULE_SETTINGS;
  }
}

export function setRuleSettings(next: RuleSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}
