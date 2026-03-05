# Lightweight Deployment Build

This folder contains an optimized build configuration for deploying Bitruvius to static hosting platforms like Netlify, GitHub Pages, Replit, and others.

## Usage

### Build for Deployment
```bash
npm run build:deploy
```

This creates a lightweight `deploy/` folder with:
- Optimized client build (no server components)
- Minimal bundle size
- Proper routing configuration for SPAs
- Security headers
- Caching strategies

### Deployment Platforms

#### Netlify
1. Run `npm run build:deploy`
2. Set **Publish directory** to `deploy` in Netlify settings
3. Deploy automatically

#### GitHub Pages
1. Run `npm run build:deploy`
2. Push the `deploy` folder to your `gh-pages` branch
3. Enable GitHub Pages in repository settings

#### Replit
1. Run `npm run build:deploy`
2. Set **Output directory** to `deploy` in Replit deployment settings
3. Deploy

#### Vercel
1. Run `npm run build:deploy`
2. Set **Output Directory** to `deploy` in Vercel settings
3. Deploy

## What's Included

- ✅ React app with all components
- ✅ Optimized CSS and assets
- ✅ Proper SPA routing
- ✅ Security headers
- ✅ Asset caching
- ❌ Server-side code (not needed for static hosting)
- ❌ Development dependencies
- ❌ Source maps
- ❌ Build artifacts

## File Structure

```
deploy/
├── index.html          # Main HTML file
├── assets/             # CSS, JS, and media files
├── _redirects          # Netlify routing
├── netlify.toml        # Netlify configuration
└── package.json        # Minimal package for local testing
```

## Local Testing

Test the deployment build locally:
```bash
cd deploy
npm install
npm start
```

This serves the app on `http://localhost:3000` with the same configuration as production.
