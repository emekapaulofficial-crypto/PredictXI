import { supabase } from './supabase.js';

(async () => {
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const confirmation = /type=signup|type=recovery|access_token=|refresh_token=/.test(`${hash}&${search}`);
    if (!confirmation) return;

    await supabase.auth.getSession();
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);

    // The confirmation page should land on the app, not a blank auth callback.
    if (!sessionStorage.getItem('statkick-auth-returned')) {
      sessionStorage.setItem('statkick-auth-returned', '1');
      window.location.replace(cleanUrl);
    }
  } catch (error) {
    console.error('StatKick auth redirect:', error);
  }
})();

window.addEventListener('load', () => {
  setTimeout(() => sessionStorage.removeItem('statkick-auth-returned'), 3000);
});
