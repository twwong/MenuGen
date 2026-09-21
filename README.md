# MenuGen

MenuGen turns menu photos or PDFs into translated, mobile-friendly visual menus while preserving source text, prices, uncertainty, and image provenance.

The application foundation is complete. The next milestone is a deterministic extraction benchmark that proves quality and cost before live AI integration. See `prd.md` for the product requirements and `docs/implementation-plan.md` for delivery order.

## Local development

Requires Node.js 22 or 24 and pnpm 11.25 or newer. CI and Vercel currently use Node.js 22.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the browser baseline after installing Playwright browsers:

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

## Documentation

- `prd.md`: Product requirements and non-negotiable behavior
- `AGENTS.md`: Repository guidance for coding agents
- `docs/implementation-plan.md`: Milestones and initial backlog
- `docs/decisions/`: Architecture decision records
