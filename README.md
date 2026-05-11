# Octo Admin

[English](./README.md) | [中文](./README.zh.md)

Octo Admin is the web-based management dashboard for the **Octo** instant-messaging platform. It provides super-administrators and space-administrators with tools to manage users, groups, spaces, application bots, backups, and download configuration.

Built with **React 18**, **TypeScript**, **Vite**, and **Ant Design 5**.

## Features

- **Dashboard** — at-a-glance view of platform activity and health
- **User management** — browse, search, and manage platform users
- **Group management** — inspect and administer groups
- **Space management** — create, configure, and moderate spaces; manage members, invites, and join applications
- **Application bots** — register, publish, and rotate tokens for platform and space-scoped bots
- **Backup management** — schedule and trigger platform data backups, inspect backup history
- **Download configuration** — manage download resources and metadata
- **Light / dark / auto theme** — follows system preference by default
- **Internationalization-ready** — Chinese UI out of the box; theme and locale switches built-in

## Quick Start

### Prerequisites

- Node.js **18+**
- npm **9+** (or a compatible package manager)
- A running Octo backend (for API calls)

### Development

```bash
npm install
cp .env.example .env.local   # edit to point at your backend
npm run dev
```

The dev server listens on `http://localhost:3000`. Requests to `/api/*` are proxied to the backend configured via `VITE_PROXY_TARGET`.

### Environment variables

See [`.env.example`](./.env.example) for the full list.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Base path for backend API requests (default `/api`) |
| `VITE_PROXY_TARGET` | Dev-mode reverse proxy target |
| `VITE_BOT_API_URL` | Optional override for the bot connect-guide API URL |

### Production build

```bash
npm run build
npm run preview   # optional: preview the build locally
```

The compiled assets are emitted to `dist/` under the `/admin/` base path.

### Docker

```bash
docker build -t octo-admin .
docker run --rm -p 8080:80 -e API_BACKEND=host.docker.internal:8090 octo-admin
```

Then open `http://localhost:8080/admin/`. The `API_BACKEND` env var is injected into the bundled `nginx.conf.template`.

## Project Structure

```
octo-admin/
├── src/
│   ├── api/          # Backend API clients
│   ├── hooks/        # Reusable React hooks
│   ├── layouts/      # App shells and theme providers
│   ├── pages/        # Route-level pages
│   ├── store/        # Zustand stores
│   ├── styles/       # Global styles and design tokens
│   ├── App.tsx       # Route configuration
│   └── main.tsx      # App entry
├── public/           # Static assets
├── index.html        # HTML template
├── Dockerfile        # Production image
├── nginx.conf.template
└── vite.config.ts
```

## Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) ([中文](./CONTRIBUTING.zh.md)) and our [Code of Conduct](./CODE_OF_CONDUCT.md) ([中文](./CODE_OF_CONDUCT.zh.md)) before opening issues or pull requests.

Security issues should be reported privately — see [SECURITY.md](./SECURITY.md) ([中文](./SECURITY.zh.md)).

## License

Licensed under the [Apache License, Version 2.0](./LICENSE). See [NOTICE](./NOTICE) for attribution.
