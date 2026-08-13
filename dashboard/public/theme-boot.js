// Runs before the bundle so the theme class is on <html> at first paint. Without
// it the page is light (white) until React mounts, which reads as a flash.
// A separate file rather than an inline script: MV3's default CSP is script-src 'self'.
try {
  var theme = localStorage.getItem('betanal:theme');
  var dark =
    theme === null ||
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {
  document.documentElement.classList.add('dark');
}
