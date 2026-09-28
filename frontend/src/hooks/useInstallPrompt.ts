import { useSyncExternalStore } from 'react'
import {
  canPromptInstall,
  isIosSafari,
  isStandalone,
  promptInstall,
  subscribe,
} from '../pwa/installPrompt'

export type InstallOffer =
  /** Already installed, or a browser that cannot install: offer nothing. */
  | { kind: 'none' }
  /** Chromium kept an install event: one tap opens the browser's dialog. */
  | { kind: 'prompt'; install: () => Promise<void> }
  /** Safari on iOS: installing is possible but only by hand, so explain it. */
  | { kind: 'ios' }

/**
 * What the app can offer towards being installed on this device.
 *
 * Read from the module-level stash in pwa/installPrompt.ts, which caught the
 * browser's event before any component existed — see there for why.
 */
export function useInstallPrompt(): InstallOffer {
  const canPrompt = useSyncExternalStore(subscribe, canPromptInstall)

  if (isStandalone()) return { kind: 'none' }
  if (canPrompt) return { kind: 'prompt', install: promptInstall }
  if (isIosSafari()) return { kind: 'ios' }
  return { kind: 'none' }
}
