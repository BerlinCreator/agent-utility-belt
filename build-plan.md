# Build Plan — Agent Utility Belt API Suite

## Prerequisites
- [ ] Install Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- [ ] Configure ACP in OpenClaw for programmatic Claude Code spawning
- [ ] Set up GitHub repo for the project
- [ ] Create Railway/Fly.io account
- [ ] Set up Stripe account (for billing)
- [ ] Register domain for the API

## Week 1: Foundation + Commodity APIs

### Day 1-2: Project Setup
- Initialize project (Fastify + TypeScript)
- Set up database schema (users, api_keys, usage_logs, subscriptions)
- Build auth middleware (API key generation + validation)
- Build rate limiting middleware
- Build usage tracking middleware
- Set up Dockerfile + docker-compose
- Deploy to Railway/Fly.io (empty server, health check only)
- Set up monitoring (uptime + error tracking)

### Day 3-4: Commodity APIs Batch 1
- Image Processing API (resize, compress, convert, bg-remove, watermark)
- PDF Toolkit API (merge, split, extract-text, to-images, compress)
- QR/Barcode API (generate, scan)
- Email Validator API

### Day 5-6: Commodity APIs Batch 2
- URL Shortener API (with analytics)
- Currency Conversion API
- IP Geolocation API
- String Utilities API
- Translation API

### Day 7: Testing + Documentation
- Write tests for all commodity APIs
- Generate OpenAPI spec
- Deploy v1 — commodity APIs live

## Week 2: High Demand APIs

### Day 8-9: Web Extract + Social Gateway
- Structured Web Extract API (fallback chain: Readability → headless browser)
- Social Data Gateway (Twitter, Reddit first)

### Day 10-11: Enrichment + Search
- Lead Enrichment API (company + person)
- SERP Analyzer API
- Social Data Gateway (YouTube, TikTok, LinkedIn)

### Day 12-13: Monitoring + Reviews
- Site Monitor API (with webhook delivery)
- Price Tracker API (Amazon, eBay)
- Review Aggregator API (Amazon, G2, Trustpilot)

### Day 14: Integration + Deploy
- Integration testing
- Deploy v2 — high demand APIs live

## Week 3: First-to-Market Agent APIs

### Day 15-16: Data APIs
- Rate Limit Oracle API
- Patent Search API
- Paper Search API
- Company Data API

### Day 17-18: Analysis APIs
- Product Scraper API
- Sentiment Analyzer API
- Resume Parser API
- Salary Data API

### Day 19-20: Utility APIs
- Tax Rate Lookup API
- Invoice/Receipt OCR API
- Calendar Availability API
- Code Runner API
- Mock API Server API

### Day 21: Deploy v3
- All 29 APIs live
- Integration testing
- Deploy v3

## Week 4: Dashboard + Launch

### Day 22-23: Customer Dashboard
- Sign up / sign in
- API key management
- Usage dashboard (calls, costs, remaining quota)
- Billing integration (Stripe)
- Documentation viewer

### Day 24-25: Polish
- Auto-generated API documentation (from OpenAPI spec)
- Quickstart guide
- Code examples in Python, JavaScript, cURL
- Rate limit headers on all responses
- Error handling standardization

### Day 26-27: Launch Prep
- Landing page
- Product Hunt listing prep
- RapidAPI listing (commodity APIs)
- Twitter/X announcement
- Reddit posts (r/SaaS, r/webdev, r/AIAgents)

### Day 28: LAUNCH DAY 🚀
- Ship it
- Monitor for issues
- Respond to feedback
- Fix bugs immediately

## Parallel Tracks (Berlin manages)
- Sub-agent: Write API documentation
- Sub-agent: Build landing page
- Sub-agent: Prepare Product Hunt listing
- Sub-agent: Monitor for issues post-launch

## Claude Code Session Plan

### Session 1: Commodity APIs (Week 1)
- Task: Build all 9 commodity APIs
- Scope: Self-contained, minimal external deps
- Expected: 9 working endpoints with tests

### Session 2: High Demand APIs (Week 2)
- Task: Build all 7 high demand APIs
- Scope: Needs Playwright, proxy setup
- Expected: 7 working endpoints with tests

### Session 3: Agent APIs + Dashboard (Week 3-4)
- Task: Build all 13 agent APIs + customer dashboard
- Scope: Complex, multi-service
- Expected: 13 working endpoints + dashboard

## Success Criteria
- [ ] All 29 APIs respond correctly
- [ ] Auth system works (key generation, validation, scoping)
- [ ] Rate limiting works (per-key, per-tier)
- [ ] Usage tracking works (accurate call counts)
- [ ] Dashboard shows usage/billing
- [ ] Documentation is complete and accurate
- [ ] 99.9% uptime in first week
- [ ] First paying customer within 7 days of launch
