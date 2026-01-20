# Cyber-Blobs

Top-down neon survival game. Survive and shoot the **NEXT** enemy.

## Run locally

```bash
python3 -m http.server 8001
```

Then open:
- http://localhost:8001

## GitHub Pages deploy

1. Create a GitHub repo named **Cyber-Blobs**.
2. Push this folder to the repo (instructions below).
3. In GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main` / `/ (root)`

After that, your site will be available at:
- `https://<your-username>.github.io/Cyber-Blobs/`

## PWA note

The app is installable on HTTPS origins (GitHub Pages counts). Some resources (Three.js) are currently loaded from a CDN, so fully offline play may require vendoring those files locally.
