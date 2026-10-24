/**
 * Unreel for Safari — removes Shorts and Reels from youtube.com and instagram.com.
 *
 * Two layers:
 *  1. rules.json (declarativeNetRequest) rewrites full page loads of /shorts/… and /reels/…
 *     before they render.
 *  2. This script handles in-page (SPA) navigation, which never hits the network as a page load,
 *     and content.css hides the shelves and nav entries that lead into the feeds.
 *
 * Policy mirrors the Android app: a single Short or Reel someone sent you opens as a normal
 * video/post (no swipe-to-next feed); the feeds themselves bounce back to the home page.
 */
(() => {
  const host = location.hostname;
  const isYouTube = /(^|\.)youtube\.com$/.test(host);
  const isInstagram = /(^|\.)instagram\.com$/.test(host);
  if (!isYouTube && !isInstagram) return;

  /** Returns the URL to go to instead, or null if this page is fine. */
  function rewrite(url) {
    const path = url.pathname;
    if (isYouTube) {
      const single = path.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
      if (single) return `/watch?v=${single[1]}`;
      if (/^\/shorts\/?$/.test(path)) return '/';
      // Channel "Shorts" tabs: /@name/shorts
      const channelShorts = path.match(/^(\/@[^/]+)\/shorts\/?$/);
      if (channelShorts) return `${channelShorts[1]}/videos`;
    }
    if (isInstagram) {
      if (/^\/reels\/?$/.test(path)) return '/';
      const single = path.match(/^\/reels?\/([A-Za-z0-9_-]{8,})\/?$/);
      if (single) return `/p/${single[1]}/`;
      // Profile reels grid: /name/reels/
      const profileReels = path.match(/^(\/[^/]+)\/reels\/?$/);
      if (profileReels) return `${profileReels[1]}/`;
    }
    return null;
  }

  let lastHref = '';
  function check() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const target = rewrite(location);
    if (target && target !== location.pathname + location.search) {
      location.replace(target);
    }
  }

  // YouTube fires this after every in-app navigation; it's a DOM event, so it reaches the
  // isolated world content scripts run in.
  document.addEventListener('yt-navigate-finish', check);
  window.addEventListener('popstate', check);
  // Fallback for anything that changes history without an event we can see (Instagram).
  // Comparing one string twice a second is negligible.
  setInterval(check, 500);
  check();
})();
