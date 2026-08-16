/**
 * The panel, drawn in the page instead of by the browser.
 *
 * A toolbar popup is a window Chrome paints: it owns the corners, the shadow and
 * the way it arrives, and no stylesheet of ours reaches any of that. Inside the
 * page there is no frame at all, so the panel can be shaped like every other
 * surface in the app.
 *
 * What is shown inside it is the popup document itself, in an iframe: there it is
 * still an extension page, with the same privileged access and the same isolation
 * from the site - the bookmaker's page cannot read a line of it, and nothing about
 * the account is written into the page's own DOM. Only the frame around it lives
 * here, in a closed shadow root so the site's stylesheets cannot reach in either.
 */

import type { Bookmaker } from '@betanal/shared';
import { PANEL_MESSAGE, type PanelMessage } from '../messaging';

/** Wide enough for the popup document, which is 300px of content plus its padding. */
const WIDTH = 332;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 560;

const STYLE = `
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
  }
  /* Where the toolbar popup would have come down: hard into the top right
     corner, under the icon that would have opened it. Flush with the top edge,
     so the page starts where the panel ends rather than showing a strip above it. */
  .panel {
    position: fixed;
    top: 0;
    right: 6px;
    width: ${WIDTH}px;
    height: ${MIN_HEIGHT}px;
    z-index: 2147483647;
    /* Hung from the top edge, so only the free corners are rounded. */
    border-radius: 0 0 16px 16px;
    overflow: hidden;
    border: 1px solid #292929;
    border-top: 0;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    background: #0f0f0f;
    opacity: 0;
    transform: translateY(-6px) scale(0.985);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      height 160ms ease;
  }
  .panel.open {
    opacity: 1;
    transform: none;
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    color-scheme: dark;
  }
  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
`;

let host: HTMLElement | null = null;
let panel: HTMLDivElement | null = null;
let frame: HTMLIFrameElement | null = null;
let removing = 0;

const hide = (): void => {
  if (host === null || panel === null) return;
  panel.classList.remove('open');
  const going = host;
  window.clearTimeout(removing);
  removing = window.setTimeout(() => going.remove(), 200);
  host = null;
  panel = null;
  frame = null;
};

const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') hide();
};

/**
 * Only from the frame we opened, and only from our own extension: the page this
 * sits in can post anything it likes at this window.
 */
const onMessage = (event: MessageEvent): void => {
  if (frame === null || panel === null || event.source !== frame.contentWindow) return;
  const data = event.data as PanelMessage | undefined;
  if (data?.tag !== PANEL_MESSAGE) return;
  if (data.close === true) {
    hide();
    return;
  }
  if (typeof data.height === 'number') {
    panel.style.height = `${Math.min(Math.max(Math.ceil(data.height), MIN_HEIGHT), MAX_HEIGHT)}px`;
  }
};

window.addEventListener('keydown', onKey);
window.addEventListener('message', onMessage);

/** Shown for the site the user is looking at; the frame is told which one it is. */
export const showPanel = (bookmaker: Bookmaker): void => {
  // The content script runs in every frame; the panel belongs to the page.
  if (window.top !== window) return;
  // Already asking. The background re-sends this when the user comes back to the
  // tab, and rebuilding the panel underneath them would throw away the answer
  // they were part-way through giving.
  if (host !== null) return;
  window.clearTimeout(removing);

  host = document.createElement('bettracker-panel');
  // Closed on purpose: the site can see that an element is here, and nothing else.
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', hide);

  panel = document.createElement('div');
  panel.className = 'panel';
  frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL(`popup.html?panel=1&site=${encodeURIComponent(bookmaker)}`);
  panel.append(frame);

  shadow.append(style, backdrop, panel);
  document.documentElement.append(host);
  // Next frame, so the browser has the closed state to animate away from.
  requestAnimationFrame(() => panel?.classList.add('open'));
};
