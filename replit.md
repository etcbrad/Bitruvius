# Bitruvius

## Project Overview
Full-stack TypeScript web application with a React frontend and Express backend, served via Vite in development.

## Architecture
- **Frontend**: React 18 with TypeScript, Tailwind CSS, shadcn/ui components, TanStack Query, Wouter routing
- **Backend**: Express 5, TypeScript via tsx, serves API + static files
- **Database**: PostgreSQL via Drizzle ORM (drizzle-kit for migrations)
- **Dev server**: Vite in middleware mode, served through Express

## Project Structure
- `client/` — React frontend (index.html, src/)
- `server/` — Express backend (index.ts, routes.ts, storage.ts, vite.ts, static.ts)
- `shared/` — Shared types/utilities used by both client and server
- `script/` — Build scripts
- `attached_assets/` — Static assets

## Running the Project
- Development: `npm run dev` (starts Express + Vite middleware on port 5000)
- Build: `npm run build`
- Production: `npm run start`
- DB push: `npm run db:push`

## Key Configuration
- Port: 5000 (mapped to external port 80)
- NODE_ENV controls dev vs production mode
- Vite aliases: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`

## Dependencies
All npm dependencies are installed in `node_modules/`. Key packages include `tsx` (TypeScript runner), `vite`, `express`, `drizzle-orm`, `react`, `@radix-ui/*` components, `tailwindcss`.
