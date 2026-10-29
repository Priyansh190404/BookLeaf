# BookLeaf Author Support Portal

An AI-powered support portal that helps authors track their books, raise support tickets, and receive timely responses. Administrators can manage tickets, prioritize requests, and use AI-generated response drafts.

## Live Demo

https://bookleaf-author-portal-psi.vercel.app/login

## Tech Stack

- **Frontend:** Next.js, TypeScript
- **Backend:** Next.js REST API routes
- **Database:** PostgreSQL (Neon)
- **AI:** Google Gemini
- **Authentication:** JWT-based authentication with role-based access control

## Key Features

- Author and administrator login
- Author-specific book and ticket access
- Support ticket creation and status tracking
- AI-assisted ticket categorization and priority assignment
- AI-generated response drafts for administrator review
- Ticket filtering and status management
- Database persistence and input validation

## Architecture

The Next.js application provides the user interface and REST API endpoints. Authentication middleware and role-based authorization protect resources. PostgreSQL stores users, authors, books, tickets, and ticket messages. AI requests are handled on the server, keeping the API key out of the client. Ticket updates are refreshed using polling.

## Local Setup

1. Clone the private repository.
2. Install dependencies using `npm install`.
3. Configure `DATABASE_URL`, `JWT_SECRET`, and `GEMINI_API_KEY` in `.env`.
4. Initialize the database and sample data using `npm run db:setup`.
5. Start the development server using `npm run dev`.

## API Documentation

See `docs/openapi.yaml` for the REST API specification.

## Limitations and Future Improvements

- Replace polling with WebSockets or server-sent events for live updates.
- Add automated end-to-end tests and monitoring.
- Add production-grade file storage and attachment scanning if not already implemented.
- Add stronger operational controls for AI usage, retries, and rate limits.
