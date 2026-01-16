---
description: Auto-increment version, verify code, deploy to GitHub, and trigger Railway
---

1. Verify code and update version numbers (Frontend & Backend)
// turbo
node tools/update_deployment_version.js

2. Commit and Push to GitHub (Triggers GitHub Pages)
// turbo
git add .
git commit -m "Deploy: Auto-update version"
git push

3. Trigger Railway Deployment (Manual CLI)
// turbo
railway up
