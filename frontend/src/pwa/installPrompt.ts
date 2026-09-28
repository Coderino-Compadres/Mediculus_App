/**
 * The browser's "install this app" offer, caught and kept for the menu to use.
 *
 * WHY THIS LISTENS AT IMPORT TIME. Chrome fires `beforeinstallprompt` once, as
 * soon as the page qualifies — which is often before React has mounted
 * anything, and always before the header menu is opened. A listener added in a
 * component's effect would miss it and the menu would never learn the app is
 * installable. So main.tsx imports this module first and the event is stashed
 * here; `useInstallPrompt` only reads the stash.
 *
 * Only Chromium browsers (Chrome, Edge, Samsung Internet) fire the event.
 * Safari on iOS never does — there the only way in is Share → "Do ekranu
 * początkowego", which is why `isIosSafari` exists.
 */

/** Not in lib.dom.d.ts: the event is Chromium-only and still non-standard. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Stops Chrome's own mini-infobar, so the offer appears where the app puts
    // it rather than over the first screen somebody sees after logging in.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canPromptInstall(): boolean {
  return deferred !== null
}

/**
 * Shows the browser's install dialog. The event can be used exactly once, so it
 * is dropped whatever the answer — Chrome fires a fresh one later if the person
 * said no and the page still qualifies.
 */
export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  notify()
  await event.prompt()
}

/** Whether the app is already running installed, from the home screen. */
export function isStandalone(): boolean {
  const standaloneQuery = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches
  // iOS reports it here instead of through the media query on older versions.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneQuery || iosStandalone
}

/**
 * Safari on an iPhone or iPad — the one browser where installing is possible
 * but has to be explained, because nothing can trigger it.
 *
 * iPadOS reports itself as a Mac, so a touch-capable "Macintosh" counts too.
 * Chrome and Firefox on iOS are excluded (CriOS/FxiOS): Apple lets them add to
 * the home screen only since iOS 16.4, through a differently placed Share menu,
 * and the instructions below would send the person looking in the wrong place.
 */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua)
}
