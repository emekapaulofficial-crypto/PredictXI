// StatKick interaction safety layer.
// Keeps primary navigation usable even if a page section is re-rendered.
(() => {
  const boot = () => {
    document.documentElement.style.pointerEvents = 'auto';
    document.body.style.pointerEvents = 'auto';
    const app = document.getElementById('app');
    if (app) app.style.pointerEvents = 'auto';

    document.addEventListener('click', (event) => {
      const el = event.target.closest('button, a');
      if (!el || el.disabled) return;

      if (el.matches('[data-page]')) {
        const page = el.dataset.page;
        if (page === 'wallet' && typeof window.renderWallet === 'function') {
          event.preventDefault();
          window.renderWallet();
        } else if (page === 'leaderboard' && typeof window.renderLeaderboard === 'function') {
          event.preventDefault();
          window.renderLeaderboard();
        } else if (typeof window.renderHome === 'function') {
          event.preventDefault();
          window.renderHome();
        }
      }
    }, false);

    window.addEventListener('error', (event) => {
      console.error('StatKick UI error:', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('StatKick UI promise error:', event.reason);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
