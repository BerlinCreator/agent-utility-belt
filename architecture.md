# Architecture — Agent Utility Belt API Suite

## Tech Stack

### Runtime
- **Language:** Node.js (TypeScript) or Python (FastAPI)
- **Recommendation:** Node.js + Fastify — fastest for API prototyping, great TypeScript support

### Infrastructure
- **Hosting:** Railway (start) → Fly.io (scale) → AWS/GCP (enterprise)
- **Database:** PostgreSQL via Supabase (free tier → paid)
- **Cache:** Redis (rate limiting, response caching)
- **File Storage:** Cloudflare R2 or S3 (processed images, PDFs, generated files)
- **CDN:** Cloudflare (free tier covers most needs)

### Auth & Billing
- **API Keys:** Custom middleware (one key per customer, scoped permissions)
- **Billing:** Stripe (subscription management + usage-based billing)
- **Dashboard:** Next.js + Tailwind (customer portal)

### Monitoring
- **Uptime:** UptimeRobot (free) or Better Stack
- **Errors:** Sentry (free tier)
- **Analytics:** Custom usage tracking in Postgres

## Project Structure

```
api-suite/
├── src/
│   ├── server.ts              # Fastify server setup
│   ├── middleware/
│   │   ├── auth.ts            # API key validation
│   │   ├── rate-limit.ts      # Rate limiting
│   │   └── usage.ts           # Usage tracking
│   ├── routes/
│   │   ├── commodity/
│   │   │   ├── image.ts       # Image processing
│   │   │   ├── pdf.ts         # PDF toolkit
│   │   │   ├── qr.ts          # QR/Barcode
│   │   │   ├── email.ts       # Email validator
│   │   │   ├── url.ts         # URL shortener
│   │   │   ├── currency.ts    # Currency conversion
│   │   │   ├── ip.ts          # IP geolocation
│   │   │   ├── string.ts      # String utilities
│   │   │   └── translate.ts   # Translation
│   │   ├── demand/
│   │   │   ├── extract.ts     # Web extract
│   │   │   ├── social.ts      # Social gateway
│   │   │   ├── enrich.ts      # Lead enrichment
│   │   │   ├── serp.ts        # SERP analyzer
│   │   │   ├── monitor.ts     # Site monitor
│   │   │   ├── price.ts       # Price tracker
│   │   │   └── reviews.ts     # Review aggregator
│   │   └── agent/
│   │       ├── rate-limit-oracle.ts
│   │       ├── patents.ts
│   │       ├── papers.ts
│   │       ├── company.ts
│   │       ├── product.ts
│   │       ├── sentiment.ts
│   │       ├── resume.ts
│   │       ├── salary.ts
│   │       ├── tax.ts
│   │       ├── ocr.ts
│   │       ├── calendar.ts
│   │       ├── code-runner.ts
│   │       └── mock.ts
│   ├── services/              # Business logic per API
│   ├── utils/                 # Shared utilities
│   └── config.ts              # Environment config
├── dashboard/                 # Next.js customer dashboard
├── docs/                      # Auto-generated API docs
├── tests/
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

## Deployment Pipeline

1. Code push to GitHub
2. Railway auto-deploys from main branch
3. Health check passes → live
4. Monitoring alerts if anything breaks

## Scaling Strategy

- **Phase 1:** Single container, $5-20/mo — handles 100K calls/day
- **Phase 2:** 2-3 containers + Redis — handles 1M calls/day
- **Phase 3:** Auto-scaling cluster + load balancer — handles 10M+ calls/day
- **Key insight:** Most APIs are stateless → scale horizontally by adding containers
