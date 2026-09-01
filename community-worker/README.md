# QuickMaths community authorization callback

This stateless Cloudflare Worker keeps the GitHub App client secret out of the public GitHub Pages bundle. It exchanges short-lived OAuth codes and refresh tokens, returns credentials only to approved QuickMaths origins, stores nothing, and never receives learner data or the separate GitHub storage token.

## One-time deployment

1. Register the public QuickMaths GitHub App with **Discussions: read and write**, no webhooks, and callback URL `https://srednjak.github.io/QuickMaths/community-auth.html`.
2. Install the app only on `Srednjak/QuickMaths`.
3. Put the public client ID in `wrangler.jsonc`, then set only the private client secret through Wrangler's encrypted secret prompt:

   ```powershell
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

4. Run `npm run deploy` and place the resulting `workers.dev` URL in `docs/github-community-config.json`.

Do not commit the client secret. The worker has no database, paid resources, webhook, repository contents permission, or access to QuickMaths learner state.
