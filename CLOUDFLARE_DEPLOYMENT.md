# Cloudflare deployment

This repository deploys to a Cloudflare Worker backed by D1.

- The production D1 binding is named `DB`.
- Set `D1_DATABASE_ID` as a Cloudflare Workers Builds variable to the UUID of the D1 database attached to `DB`.
- Set the deploy command to `npm run deploy:cloudflare`. It applies pending migrations from `drizzle/` to the remote D1 database before deploying the Worker.
- A push to the connected GitHub branch starts a new Cloudflare build.

Do not paste OAuth secrets or session secrets into this file or into GitHub. Keep them in the Worker environment's secret settings.
