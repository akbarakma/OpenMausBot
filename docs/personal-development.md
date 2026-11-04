# Personal desktop development

The development window renders this checkout's React UI and uses the saved
Personal connection for its API requests. It starts Vite on loopback and runs
no agent server, provider CLI, computer-control daemon, companion host, or
binary updater. The installed Personal and official apps can stay open.

## Start and stop

Run from the repository root on mb-0:

```sh
corepack pnpm dev:personal
```

The default UI address is `127.0.0.1:5199`. A busy port stops startup without
moving to another port or stopping its listener. Choose another port with:

```sh
corepack pnpm dev:personal --port 5200
```

Close the development window or press Ctrl+C in its terminal to stop it.
Its Vite server and proxy connections close together.

## Profiles and authentication

The development profile lives in
`~/Library/Application Support/OpenMausBot Personal Dev`. It persists across
launches and stays separate from `OpenMausBot Personal` and the official app.
Native preferences are copied once from Personal. Later development preferences
stay independent. No profile data belongs in this public repository.

The active remote connection comes from Personal's saved server list. Connect
Personal to the desired server before launching development. An optional
`OMB_PERSONAL_SERVER` environment variable selects another HTTPS origin without
changing Personal's connection. No server address or credential is baked into
the frontend bundle.

On first launch, an available unencrypted OpenMausBot session cookie is read
from Personal's cookie database through a read-only connection. Electron stores
the imported cookie in the development profile. Encrypted or missing source
cookies require signing in through the development app's **Server → Sign in…**
window. That window uses the remote server's normal sign-in flow. It has no
preload or Node access. Close it after signing in to reload the development UI.

The loopback API accepts only the development window's private request header.
Electron adds that header below JavaScript. The relay replaces browser cookies
and authorization headers with the selected server's session cookie, checks the
request origin, and keeps the remote cookie out of responses. It preserves HTTP
bodies, SSE streams, and WebSocket frames. Other browsers cannot use the relay.

Keeping the UI on the loopback origin lets Vite's normal hot reload work.
Intercepting UI files at the remote origin would also require a separate path
for Vite's WebSocket connection and remote content policies.

## Edit and verify

React and CSS changes update the development window when saved. Changes to
the launcher, main process, or preload require restarting development.
The installed app continues to use its last packaged build.

Normal UI actions affect the connected server. Verify writes against an
isolated fixture, rather than live bots or conversations. Run the dedicated
checks with:

```sh
node --test electron/personal-dev.node-test.mjs
corepack pnpm verify:personal-dev
corepack pnpm typecheck
```

The Electron verification creates its own HTTP server, UI source, and profile.
It checks native cookie forwarding, streamed events, WebSocket frames,
untrusted-request rejection, and a live module update without a page reload.
It never connects to a saved server. Evidence is written under
`release/personal-dev-verification/`; its temporary profile is removed afterward.

The upstream `dev:server` and `dev:desktop` scripts retain their original
behavior. Use `dev:personal` for this client workflow. The upstream
`package:mac` command also retains the official app identity. Personal packaging
must preserve the installed Personal identity and data directory before replacing
that app; the development launcher does not change packaged app behavior.
