# celld

The [`alchemy-cloudflare`](../alchemy-cloudflare/) GitHub agent, running on [celld](https://celld.dev) instead of Cloudflare. It reuses that example's bot, mailbox, AgentSession, and Computer code; only the Worker module and its configuration live here.

## What differs from Cloudflare

- **One script.** A celld fleet runs one application, so the Computer Durable Object runs in the same Worker as the mailboxes and sessions, not a Worker of its own.
- **No auto-labeling.** celld has no Workers AI, so new issues and pull requests are not labeled.
- **Copilot for the agent.** The celld host supplies a GitHub Copilot model; the Cloudflare example still uses OpenAI. A separate device login discovers your seat's API endpoint and saves its OAuth credential locally. This uses Copilot's undocumented API and may break when GitHub changes it.
- **Shell only.** celld cannot intercept a container's outbound HTTP, which `@cloudflare/computer`'s container backend needs, so the agent's `container` backend fails. The `shell` backend uses Computer's supported external-runtime seam to run its existing `ShellWorker` beside the SQLite workspace. celld's Worker Loader cannot run Computer's embedded shell (`createRequire` is missing) or pass the workspace RPC capabilities across isolates. This remains a virtual filesystem and virtual shell, not access to the host's files or native processes. Direct shell HTTP is disabled, but there is no separate Worker-isolate boundary; use this example only with trusted repositories and users.
- **Deployed from `wrangler.json`.** `alchemy deploy` generates the Worker module and its bindings for Cloudflare. Here, [`src/entry.ts`](src/entry.ts) is that module, written out, and [`wrangler.json`](wrangler.json) declares the bindings. `bun run build` bundles it with Alchemy's Cloudflare build into `dist/`, which celld deploys as it is (`no_bundle`); celld's own esbuild run cannot bundle it.
- **celld compatibility adapters:** its `process.stdin` has no events ([`src/processStdin.ts`](src/processStdin.ts)), a Durable Object whose `then` is a function never answers an RPC call ([`src/entry.ts`](src/entry.ts)), and `inflateSync` ignores `{ info: true }` ([`src/GitInflate.ts`](src/GitInflate.ts)). The build routes only the Computer git implementation's zlib import through a pako adapter, preserving consumed-byte counts and incomplete-input errors needed to read packfiles. Pako 1.x stops at the first compressed stream; 2.x attempts concatenated streams, which is incompatible with adjacent git packfile objects.

## Run it locally

Install [celld](https://celld.dev) and set up the GitHub App as [`../alchemy-cloudflare/SETUP.md`](../alchemy-cloudflare/SETUP.md) describes. Then:

```sh
cp .env.example .env   # fill in the values
bun run copilot:login  # complete the GitHub device sign-in in your browser
bun run dev
```

`bun run dev` writes `.dev.vars` from `.env`, builds `dist/`, and starts `celld dev` on `http://127.0.0.1:9876`. Expose that URL publicly, for example with a tunnel, and set the GitHub App's webhook URL to `https://<public-host>/integrations/github/webhook`.

No OpenAI key is needed. Set the GitHub App values in `.env`; `COPILOT_MODEL` defaults in the template to `gpt-6.1-sol` and must be available to your Copilot seat. The App credential authenticates repository operations; the separate Copilot credential authenticates model requests. The model client marks requests as agent-initiated.

Run `bun run copilot:smoke` to verify a real Copilot response survives a Fold session without involving GitHub webhooks. It reports only outcome and answer length. Copilot's Responses API can change item IDs between text/reasoning stream events; [`src/CopilotStream.ts`](src/CopilotStream.ts) normalizes them so Fold can assemble the final answer instead of silently completing without text.

`.copilot.json` and `.dev.vars` contain plaintext credentials, are ignored by version control, and are written with owner-only permissions. Do not share them or expose them through your tunnel. Login refuses to overwrite an existing `.copilot.json`; remove that file yourself before signing in again if the credential is revoked. No credentials are copied from OpenCode.

**Local persistence needs no S3.** celld keeps its local object store and application state in `.celld/dev/`. Restarts and rebuilds reuse it, including mailbox state, conversations and repository files. Keep this directory, and do not use `celld dev --clean` unless you intend to delete the state. This is local durability, not a remote backup. Session expiry still deletes idle workspaces after 14 days.

`.dev.vars` holds each value as `alchemy deploy` would bind it: a `{"_tag":"Redacted","value":"…"}` marker. Alchemy's runtime parses every binding as JSON, so a raw App ID such as `12345` would arrive as a number and fail `Config`.

After changing code, run `bun run build`; `celld dev` picks up the new `dist/`.

### Verify workspace tools without GitHub

```sh
bun run workspace:smoke:build
celld dev .celld/workspace-smoke --port 9877
# In another terminal:
curl --fail-with-body http://127.0.0.1:9877/
```

This uses an isolated Computer database, not the bot's `.celld/dev/` state, and needs no credentials. HTTP 200 with `passed: true` verifies file reading, shell execution, a pipe/redirection, `jq`, and missing-file errors in the actual celld runtime. Stop that diagnostic server afterwards. File reads use `arrayBuffer()` rather than `Response.bytes()`, which celld does not implement. The build selects [`src/ComputerShell.ts`](src/ComputerShell.ts) only for celld; Cloudflare retains its Worker Loader backend.

### GitHub webhook tunnel

OpenTunnel profile `celld-webhooks` forwards HTTPS traffic to `127.0.0.1:9876`. Its GitHub App webhook URL is:

```text
https://360a781b90e64b12.pvxg3rifanbh.opentunnel.xyz/integrations/github/webhook
```

Start or inspect the tunnel:

```sh
opentunnel --profile celld-webhooks up
opentunnel --profile celld-webhooks status
```

The first start waits for certificate verification. `up` installs a service that also starts at login. Stop it and disable login startup with:

```sh
opentunnel --profile celld-webhooks down
```

Keep `bun run dev` running separately. The tunnel exposes the Worker listener, not a directory or celld's operator listener. Do not delete the tunnel unless you want to lose its hostname. In GitHub App **Advanced → Recent Deliveries**, redeliver an event after both services are running and check for HTTP 200. A signature failure indicates a webhook-secret mismatch; a connection failure means checking celld on port 9876 and the tunnel's connection status first.

## Follow-up tasks

- [ ] **Set up OpenTunnel for local GitHub webhooks and document the workflow.**
    - [x] Verify the OpenTunnel CLI commands and create the `celld-webhooks` HTTPS route to `http://127.0.0.1:9876`.
    - Document tunnel startup/shutdown, the GitHub App webhook URL (`https://<public-host>/integrations/github/webhook`), and what to update if the public hostname changes.
    - Keep the celld operator listener, local credential files, and database state private; do not serve the project directory.
    - Verify a signed GitHub webhook reaches celld and returns HTTP 200, then mention the bot in a test issue and confirm it responds.
    - Add copyable commands and troubleshooting guidance here, including GitHub Recent Deliveries/redelivery, signature failures, and tunnel connectivity.

## Deploy to a fleet

`celld deploy` does not read `.dev.vars`, and celld has no secret store: put the packed values under `vars` in `wrangler.json`, which celld keeps in the fleet bucket. Treat the bucket's credentials as the secrets' credentials.

The celld host requires `COPILOT_TOKEN`, `COPILOT_API_URL`, and optionally `COPILOT_MODEL` as well as the GitHub App bindings. Never commit credentials in `wrangler.json`.
