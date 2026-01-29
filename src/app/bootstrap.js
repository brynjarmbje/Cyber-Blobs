// @ts-nocheck

async function fetchHtml(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.text();
}

function toFragment(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '').trim();
  return t.content;
}

async function mountAppShell() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');

  const [menuHtml, appHtml, modalsHtml] = await Promise.all([
    fetchHtml('./views/main-menu.html'),
    fetchHtml('./views/app.html'),
    fetchHtml('./views/modals.html'),
  ]);

  root.replaceChildren(toFragment(menuHtml), toFragment(appHtml), toFragment(modalsHtml));
}

(async () => {
  try {
    await mountAppShell();
    await import('./main.js');
  } catch (err) {
    console.error(err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding:16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #fff; background:#000; min-height:100vh;">
          <h1 style="margin:0 0 8px; font-size:18px;">Cyber Yolks failed to load</h1>
          <p style="margin:0; opacity:0.9;">Try refreshing. If you're offline, open once online to cache assets.</p>
        </div>
      `;
    }
  }
})();
