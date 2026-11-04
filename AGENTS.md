# OpenMausBot agent notes

## Personal desktop fork

This public fork customizes the desktop interface for Akbar's mb-0.
The upstream repository is `milind-soni/OpenMausBot`.

- Keep personal changes in the desktop UI and client connection code.
- Keep mb-0 as a client; do not start a local agent server during normal use.
- Keep bb-1 on official upstream builds; do not deploy this fork there or change its services.
- Preserve the server's existing API contracts and authentication.
- Defer iOS development and release notifications until Akbar requests them.
- Use isolated fixtures for development and verification; do not mutate live conversations or settings during tests.
- Give the fork a separate app identity and profile before installing it alongside the official app.
- Disable upstream binary auto-updates or point them at this fork's releases before installing a custom build.

## Public repository credentials

- Keep provider credentials on the server; do not copy them into this checkout.
- Store local secrets in OS credential storage or ignored `.env.local` files.
- Commit only dummy values in `.env.example` or `.env.*.example` files.
- Treat `VITE_*` variables and packaged frontend code as public; never put secrets in them.
- Keep passwords, tokens, private keys, pairing links, session data, and signing credentials out of tracked files and screenshots.
- Keep inherited deployment and release workflows disabled until Akbar requests their setup.
- Before committing, inspect `git diff --cached` and `git diff --cached --name-only` for credentials and private files.
- Check each local secret file with `git check-ignore -v -- <path>` before committing or pushing.
- Stop publication if a secret appears; redact it when reporting the problem.

Before claiming a server or conversation change works, follow
[`docs/verification/README.md`](docs/verification/README.md). Always launch an
isolated fixture; never verify mutations against the user's live app or data.

## Comments

Write a comment only for what the code cannot say:

- a license or attribution notice;
- a fact forced by something outside this code (a vendor, CLI, OS, browser,
  Electron or protocol behaviour), with its version when it has one;
- the doc comment of a public contract: the wire types in `shared/`, the
  driver interface, the preload bridge, `config.json` fields people edit;
- a link to an upstream issue;
- a security invariant or a known open risk.

Do not narrate what the next line does, restate a name, record history ("used
to", "no longer", PR or issue numbers, plan or slice names: git has it), point
at other files, draw banners or leave commented-out code. When our own code
needs a paragraph to explain a surprise, change the code instead: a better
name, a type, an extracted function, one shared helper. A rule ("never X",
"must match Y") belongs in a type, a test or a lint rule. Never suppress a lint
rule that guards correctness; fix the code.

More specific `AGENTS.md` files override this note within their directories.
