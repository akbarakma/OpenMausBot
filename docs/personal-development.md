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
The installed app shows a change only after `package:personal --install`.

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
`package:mac` command also retains the official app identity, so use
`package:personal` for the installed app.

## Installed Personal app

The installed Personal app opens the connected server's address, as the
official app does. When the server sends one of its UI files, Personal answers
with its own copy instead. Every other request still reaches the server.

| Request | Answered by |
|---|---|
| `/`, `/rail`, `/pair` and other app pages | the bundled `index.html` or `rail.html` |
| `/assets/index-a1b2.js`, icons and fonts in the bundle | the bundled file |
| files the bundle lacks | the server |
| `/api/*`, `/.well-known/*`, streams, uploads and WebSockets | the server |
| redirects, errors and non-HTML pages such as `/mcp-oauth/callback` | the server |

Personal uses Chromium's Fetch interception through the window's debugger. It
pauses only page, script, style, font, image and media requests, so login
cookies, streams and uploads take their normal path. Only the Personal app
identity turns this on. The official app keeps showing the server's UI.

If interception cannot start, Personal logs
`personal ui: interception unavailable` in its `server.log` and shows the
server's UI.

### Build and install

Commit your changes first, because the app records its source commit. Quit
Personal, then run from the repository root:

```sh
corepack pnpm package:personal --install
```

The script builds the UI, server and companion, packages the app as
`com.akbarakma.openmausbot.personal` with no auto-update and no
`openmausbot://` link handling, and signs it ad hoc. With `--install` it
replaces `/Applications/OpenMausBot Personal.app` and moves the previous copy to
the Trash. Settings and data stay in `OpenMausBot Personal` and
`OpenMausBot Personal Data` under `~/Library/Application Support`. Without
`--install` it only builds into `release/personal/<commit>/`.

Native resources (`dist-native`) come from an earlier
`corepack pnpm package:prepare`. The speech helper comes from
`electron/resources` or from the installed Personal app.

### Verify

```sh
node --test electron/personal-ui.node-test.mjs
corepack pnpm verify:personal-ui
```

The Electron check starts its own fake server with its own UI and a separate
bundle. It confirms the bundled page and scripts load, and that files the bundle
lacks, API pages and the OAuth callback come from the server. It also checks a
login cookie, two streamed events, a WebSocket echo and a 3 MB upload. Evidence
is written under `release/personal-ui-verification/`.

After installing, open Personal and confirm the change on screen. A bundle that
contains the change proves nothing if the window shows another UI.

## Upstream releases

bb-1 runs official builds, and Personal's UI must match bb-1's server version.
For example, when `v0.1.141` is released:

1. Notice it from GitHub's **Watch → Custom → Releases** email, or from the
   update row in the sidebar's profile menu, which asks bb-1.
2. Update bb-1 with `npm install -g openmausbot@latest`, then restart its service.
3. Merge the upstream tag: `git fetch upstream --tags && git merge v0.1.141`.
   Merge tags, not upstream `main`, so the UI matches the server exactly.
4. Resolve conflicts. The only Personal hook in upstream code is in
   `electron/main.mjs`: the `attachPersonalUi` call in `createWindow`, and the
   remote branch that waits for it before loading the server's origin.
5. Run the checks above, then `corepack pnpm package:personal --install`.

Between steps 2 and 5, Personal shows the old UI against the new server. Most
screens keep working, but a new feature can fail until you rebuild. During that
gap the update row offers **Reload for v0.1.141**. A reload loads the same bundle,
so rebuild Personal instead.

Personal never updates itself, so a release cannot overwrite the fork.
