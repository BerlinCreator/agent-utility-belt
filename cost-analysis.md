# Cost Analysis — Agent Utility Belt API Suite

## Infrastructure Costs by Phase

### Phase 1: MVP (Month 1-2, <1K users)
| Item | Monthly Cost |
|------|-------------|
| Server (Railway/Fly.io) | $5-20 |
| Database (Postgres) | $5-15 |
| File storage | $1-5 |
| Domain + SSL | $1 |
| **Total** | **$12-41/mo** |

### Phase 2: Growth (Month 3-4, 1K-5K users)
| Item | Monthly Cost |
|------|-------------|
| Server (auto-scaling containers) | $50-150 |
| Database (managed Postgres) | $25-50 |
| Redis (caching/rate limits) | $10-15 |
| CDN + file storage | $10-30 |
| Monitoring (Sentry) | $0-26 |
| **Total** | **$95-271/mo** |

### Phase 3: Scale (Month 5+, 5K+ users)
| Item | Monthly Cost |
|------|-------------|
| Server cluster | $200-500 |
| Database (HA Postgres) | $100-200 |
| Redis cluster | $30-50 |
| CDN + storage | $50-100 |
| WAF + DDoS protection | $20-50 |
| Monitoring + logging | $50-100 |
| **Total** | **$450-1,000/mo** |

## Third-Party Data Costs (COGS)

| Data Source | Cost | Used By |
|-------------|------|---------|
| ECB exchange rates | Free | Currency API |
| MaxMind GeoLite2 | Free | IP Geolocation |
| USPTO/EPO APIs | Free | Patent Search |
| arXiv/Semantic Scholar | Free | Paper Search |
| LibreTranslate | Free | Translation |
| Proxy service | $50-100/mo | Web Extract, Social, SERP |
| DeepL API (optional) | $0.002/call | Translation (premium) |

## Revenue Projections

### Month 1
- 50 free users → 10 convert to Starter ($19) = $190 MRR
- Infrastructure cost: ~$30/mo
- **Net: +$160/mo**

### Month 3
- 200 free → 40 Starter ($19) + 10 Pro ($49) = $1,250 MRR
- Infrastructure: ~$150/mo
- **Net: +$1,100/mo**

### Month 6
- 500 free → 200 Starter ($19) + 50 Pro ($49) + 10 Team ($99) = $7,240 MRR
- Infrastructure: ~$300/mo
- **Net: +$6,940/mo**

### Month 12
- 2,000 free → 500 Starter + 150 Pro + 30 Team = $17,420 MRR
- Infrastructure: ~$600/mo
- **Net: +$16,820/mo**

## Gross Margin Analysis
- API call cost: $0.0001 - $0.005 per call (avg $0.001)
- Average revenue per call: $0.003-0.01
- **Gross margin: 85-95%**
