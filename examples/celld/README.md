# celld

The [`alchemy-cloudflare`](../alchemy-cloudflare/) GitHub agent, running on [celld](https://celld.dev) instead of Cloudflare. It reuses that example's bot, mailbox, AgentSession, and Computer code; only the Worker module and its configuration live here.

## What differs from Cloudflare

- **One script.** A celld fleet runs one application, so the Computer Durable Object runs in the same Worker as the mailboxes and sessions, not a Worker of its own.
- **No auto-labeling.** celld has no Workers AI, so new issues and pull requests are not labeled.
- **Shell only.** celld cannot intercept a container's outbound HTTP, which `@cloudflare/computer`'s container backend needs, so the agent's `container` backend fails. The `shell` backend runs on celld's Worker Loader.
- **Deployed from `wrangler.json`.** `alchemy deploy` generates the Worker module and its bindings for Cloudflare. Here, [`src/entry.ts`](src/entry.ts) is that module, written out, and [`wrangler.json`](wrangler.json) declares the bindings. `bun run build` bundles it with Alchemy's Cloudflare build into `dist/`, which celld deploys as it is (`no_bundle`); celld's own esbuild run cannot bundle it.
- **Two celld gaps are worked around:** its `process.stdin` has no events ([`src/processStdin.ts`](src/processStdin.ts)), and a Durable Object whose `then` is a function never answers an RPC call ([`src/entry.ts`](src/entry.ts)).

## Run it locally

Install [celld](https://celld.dev) and set up the GitHub App as [`../alchemy-cloudflare/SETUP.md`](../alchemy-cloudflare/SETUP.md) describes. Then:

```sh
cp .env.example .env   # fill in the values
bun run dev
```

`bun run dev` writes `.dev.vars` from `.env`, builds `dist/`, and starts `celld dev` on `http://127.0.0.1:9876`. Expose that URL publicly, for example with a tunnel, and set the GitHub App's webhook URL to `https://<public-host>/integrations/github/webhook`.

`.dev.vars` holds each value as `alchemy deploy` would bind it: a `{"_tag":"Redacted","value":"…"}` marker. Alchemy's runtime parses every binding as JSON, so a raw App ID such as `12345` would arrive as a number and fail `Config`.

After changing code, run `bun run build`; `celld dev` picks up the new `dist/`.

## Deploy to a fleet

`celld deploy` does not read `.dev.vars`, and celld has no secret store: put the packed values under `vars` in `wrangler.json`, which celld keeps in the fleet bucket. Treat the bucket's credentials as the secrets' credentials.
