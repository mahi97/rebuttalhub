# RebuttalHub

A collaborative platform for managing academic paper rebuttals. RebuttalHub helps research teams track reviewer comments, coordinate responses, and draft rebuttals — all in one place.

## Features

- **Project Workspaces** — Create a project per paper; invite teammates via a shareable invite code.
- **Review Import** — Paste OpenReview HTML, upload PDFs, or provide LaTeX source to automatically extract reviewer comments.
- **AI-Powered Assistance** (Claude) — Draft responses to review points, summarize reviews, compile full rebuttals, polish prose, and reduce length.
- **Task Board** — Each extracted review point becomes a trackable task with priority, status, and assignee fields.
- **Collaborative Commenting** — Threaded comments on every review point with resolve/unresolve support.
- **Rebuttal Version History** — Save, compare, and restore rebuttal drafts with a full change-set log.
- **Export** — Export the finished rebuttal in common formats.
- **Archive** — Archive completed projects and restore them at any time.
- **Real-time Updates** — Live collaboration powered by Supabase Realtime.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Database & Auth | [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage + Realtime) |
| AI | [Anthropic Claude](https://www.anthropic.com) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Language | TypeScript |
| Deployment | [Vercel](https://vercel.com) |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

### 1. Clone the repository

```bash
git clone https://github.com/mahi97/rebuttalhub.git
cd rebuttalhub
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

> **Note:** Each user can store their own Anthropic API key in the app's Settings page. No server-side key is required.

### 3. Set up the database

Run the migration scripts in order in the Supabase SQL editor:

```
supabase-schema.sql            # base schema
supabase-migration-v2.sql
supabase-migration-v3.sql
supabase-migration-v4.sql
supabase-migration-v5.sql
supabase-migration-v6.sql
supabase-migration-v7.sql
supabase-migration-v8.sql
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── api/          # Route handlers (files, LLM, projects, tasks)
│   ├── dashboard/    # Project list
│   ├── project/[id]/ # Per-project views (board, reviews, documents, export, settings)
│   ├── settings/     # User profile & API key
│   └── login/        # Authentication
├── components/       # Reusable UI components
├── hooks/            # Custom React hooks
├── lib/              # Supabase client, LLM helpers, file processing utilities
└── types/            # Shared TypeScript types
```

## Deployment

The recommended deployment target is [Vercel](https://vercel.com). After connecting the repository, add the same environment variables defined in `.env.local` to your Vercel project settings.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmahi97%2Frebuttalhub)

## Contributing

Contributions are welcome! Please open an issue to discuss what you would like to change, then submit a pull request.

## License

This project is open source. See [LICENSE](LICENSE) for details.
