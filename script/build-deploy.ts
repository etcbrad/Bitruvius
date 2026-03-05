import { build as viteBuild } from "vite";
import { rm, readFile, writeFile, copyFile } from "fs/promises";
import path from "path";

async function buildDeploy() {
  console.log("Creating lightweight deployment build...");
  
  // Clean deploy directory
  await rm("deploy", { recursive: true, force: true });
  
  // Build client with deployment config
  console.log("Building client for deployment...");
  await viteBuild({ configFile: "vite.deploy.config.ts" });
  
  // Create a simple _redirects file for Netlify SPA support
  const redirectsContent = "/*    /index.html   200\n";
  await writeFile("deploy/_redirects", redirectsContent);
  
  // Create a simple netlify.toml for optimal settings
  const netlifyConfig = `[build]
  publish = "deploy"
  
[build.environment]
  NODE_VERSION = "18"
  
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    
[[headers]]
  for = "*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    
[[headers]]
  for = "*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    
[[headers]]
  for = "*.png"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    
[[headers]]
  for = "*.jpg"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    
[[headers]]
  for = "*.svg"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`;
  await writeFile("deploy/netlify.toml", netlifyConfig);
  
  // Create a simple package.json for deployment if needed
  const deployPackageJson = {
    "name": "bitruvius-deploy",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "start": "npx serve -s . -l 3000"
    },
    "devDependencies": {
      "serve": "^14.2.1"
    }
  };
  await writeFile("deploy/package.json", JSON.stringify(deployPackageJson, null, 2));
  
  console.log("✅ Lightweight deployment build created in 'deploy' folder");
  console.log("📁 Ready for Netlify, GitHub Pages, Replit, and other static hosts");
}

buildDeploy().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
