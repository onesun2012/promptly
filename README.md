# Promptly

**Select text anywhere. Ask with your own AI.**

The best local-first BYOK (bring-your-own-key) selection-to-AI assistant for Windows. Select text in any app — browser, office suite, editor — and ask AI instantly with **your own API keys**, connecting **directly** to your providers. No account. No cloud relay. No telemetry on your content.

- [Product SPEC (中文)](SPEC.md) · [Contributing](docs/CONTRIBUTING.md) · [Bragi reference review (中文)](docs/bragi精读笔记.md)

## Status

**M0 scaffold** — Electron + Vue3 + TypeScript foundation with window management and the NSIS packaging chain verified.

| Milestone | Scope |
|---|---|
| M0 ✅ | Scaffold, window management, build & packaging chain |
| M1 | Selection detection pipeline (mouse hook → UIA → clipboard fallback → sensitive-field guard) |
| M2 | Provider layer (OpenAI-compatible / Anthropic / Gemini + capability model + test connection) |
| M3 | Chat window, multi-session, local history |
| M4 | Floating ball, hotkeys, i18n (en/fr/de/es/ja/ko), installer + auto-update |

## Development

Requirements: Node.js ≥ 20, npm ≥ 10.

```bash
npm install
npm run dev        # start dev app
npm run typecheck  # vue-tsc for main/preload and renderer
npm run lint       # eslint
npm run build      # electron-vite build
npm run dist       # NSIS installer → dist/
npm run dist:dir   # unpacked build → dist/win-unpacked/
```

> **Mirror tip (CN network):** electron binary and electron-builder tooling download from GitHub by default. If they stall:
>
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```
>
> If `node_modules/electron/dist` is missing after install, run `node node_modules/electron/install.js` once (npm ≥ 11.19 blocks install scripts until approved via `npm install-scripts approve <pkg>`).

## Security principles

- API keys are encrypted at rest (Electron `safeStorage` / DPAPI) and never leave the device except in requests to the endpoint **you** configured.
- Password fields are never captured; the clipboard fallback is hard-disabled on sensitive fields.
- Zero content telemetry. Opt-in anonymous crash reporting only.

## License

TBD — see [SPEC appendix D](SPEC.md). All third-party reference code lives in `references/` (gitignored) and is never copied into this codebase.
