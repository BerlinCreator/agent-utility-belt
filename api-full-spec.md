# Full API Spec — Agent Utility Belt

## BUCKET A: Commodity APIs

### 1. Image Processing
- **Endpoints:** POST /v1/image/resize, /compress, /convert, /bg-remove, /watermark
- **Inputs:** Image URL or base64, dimensions, format, quality
- **Output:** Processed image URL
- **Tech:** Sharp (Node.js) or Pillow (Python)
- **Build time:** 2 days
- **Cost per call:** $0.002
- **External deps:** None

### 2. PDF Toolkit
- **Endpoints:** POST /v1/pdf/merge, /split, /extract-text, /to-images, /compress
- **Inputs:** PDF URL(s), page ranges
- **Output:** Processed PDF URL or extracted text
- **Tech:** pdf-lib, pdf-parse
- **Build time:** 2 days
- **Cost per call:** $0.005
- **External deps:** None

### 3. QR/Barcode
- **Endpoints:** POST /v1/qr/generate, POST /v1/qr/scan, POST /v1/barcode/generate
- **Inputs:** Data string, format, size
- **Output:** Image URL or decoded data
- **Tech:** qrcode, jsbarcode
- **Build time:** 1 day
- **Cost per call:** $0.001
- **External deps:** None

### 4. Email Validator
- **Endpoints:** POST /v1/email/validate
- **Inputs:** Email address
- **Output:** valid, deliverable, disposable, role_account, catch_all, mx_found
- **Tech:** SMTP check + DNS + disposable email list
- **Build time:** 1 day
- **Cost per call:** $0.003
- **External deps:** None

### 5. URL Shortener
- **Endpoints:** POST /v1/urls/shorten, GET /v1/urls/{slug}/stats, DELETE /v1/urls/{slug}
- **Inputs:** Long URL, optional custom slug
- **Output:** Short URL, click analytics
- **Tech:** Redirect server + click tracking
- **Build time:** 1 day
- **Cost per call:** $0.001
- **External deps:** Database

### 6. Currency Conversion
- **Endpoints:** GET /v1/currency/convert, GET /v1/currency/rates, GET /v1/currency/historical
- **Inputs:** From currency, to currency, amount, optional date
- **Output:** Converted amount, rate, timestamp
- **Tech:** ECB free data feed
- **Build time:** 1 day
- **Cost per call:** $0.001
- **External deps:** ECB feed (free)

### 7. IP Geolocation
- **Endpoints:** GET /v1/ip/lookup
- **Inputs:** IP address
- **Output:** Country, city, region, lat/lon, ISP, timezone, threat score
- **Tech:** MaxMind GeoLite2
- **Build time:** 1 day
- **Cost per call:** $0.002
- **External deps:** MaxMind (free tier)

### 8. String Utilities
- **Endpoints:** POST /v1/string/slugify, /encode, /decode, /hash, /generate, /case-convert
- **Inputs:** Text, algorithm, type
- **Output:** Processed string
- **Tech:** Built-in language libraries
- **Build time:** 1 day
- **Cost per call:** Free tier / $0.001
- **External deps:** None

### 9. Translation
- **Endpoints:** POST /v1/translate, POST /v1/translate/detect
- **Inputs:** Text, target language, optional source language
- **Output:** Translated text, detected language
- **Tech:** LibreTranslate (self-hosted) or DeepL wrapper
- **Build time:** 1 day
- **Cost per call:** $0.002
- **External deps:** LibreTranslate (free) or DeepL API

---

## BUCKET B: High Demand, No Good Option

### 10. Structured Web Extract
- **Endpoints:** POST /v1/extract
- **Inputs:** URL, format (json/markdown), extract_tables (bool), js_render (bool)
- **Output:** title, content, content_type, images[], tables[], word_count, reading_time
- **Tech:** Playwright headless + Readability fallback chain
- **Build time:** 3-4 days
- **Cost per call:** $0.005 (basic) / $0.02 (JS-rendered)
- **External deps:** Headless browser hosting

### 11. Social Data Gateway
- **Endpoints:** POST /v1/social/search, GET /v1/social/profile, GET /v1/social/trends
- **Inputs:** platform (twitter/reddit/youtube/tiktok/linkedin), query, type, limit
- **Output:** Structured posts/profiles/trends data
- **Tech:** Platform-specific scrapers + proxy rotation
- **Build time:** 5-7 days
- **Cost per call:** $0.005-0.02
- **External deps:** Proxy service ($50-100/mo)

### 12. Lead Enrichment
- **Endpoints:** POST /v1/enrich/company, POST /v1/enrich/person
- **Inputs:** Domain or email
- **Output:** Company data (industry, size, funding, tech stack, social) or Person data (name, title, company, linkedin)
- **Tech:** Public data aggregation + scraping
- **Build time:** 4-5 days
- **Cost per call:** $0.01-0.05
- **External deps:** None (public data)

### 13. SERP Analyzer
- **Endpoints:** GET /v1/serp/search
- **Inputs:** query, engine (google/bing), country, limit
- **Output:** results[], featured_snippet, people_also_ask[], related_searches[]
- **Tech:** Google scraping with rotation
- **Build time:** 3-4 days
- **Cost per call:** $0.01
- **External deps:** Proxy service

### 14. Site Monitor
- **Endpoints:** POST /v1/monitor/create, GET /v1/monitor/{id}, DELETE /v1/monitor/{id}
- **Inputs:** URL, CSS selector, frequency, webhook URL
- **Output:** Monitor ID, change diffs via webhook
- **Tech:** Scheduled scraping + diff engine + webhook delivery
- **Build time:** 3-4 days
- **Cost per call:** $0.005/check
- **External deps:** Job scheduler (cron/BullMQ)

### 15. Price Tracker
- **Endpoints:** POST /v1/price/track, GET /v1/price/history, DELETE /v1/price/track/{id}
- **Inputs:** Product URL (amazon/ebay/shopify), webhook
- **Output:** Product data, current price, price history[], stock status
- **Tech:** Marketplace-specific scrapers
- **Build time:** 4-5 days
- **Cost per call:** $0.01/lookup, $0.005/tracked item/day
- **External deps:** Job scheduler

### 16. Review Aggregator
- **Endpoints:** GET /v1/reviews
- **Inputs:** platform (amazon/g2/trustpilot/yelp), product identifier, limit
- **Output:** overall_rating, total_reviews, sentiment{}, top_keywords[], reviews[]
- **Tech:** Platform-specific scrapers
- **Build time:** 4-5 days
- **Cost per call:** $0.005-0.02
- **External deps:** None

---

## BUCKET C: First-to-Market (Agent-Specific)

### 17. Rate Limit Oracle
- **Endpoints:** GET /v1/rate-limit/check, GET /v1/rate-limit/list
- **Inputs:** API name, endpoint, plan tier
- **Output:** limit, remaining, reset_at, optimal_call_time, warning
- **Tech:** API limit database + monitoring
- **Build time:** 4-5 days
- **Cost per call:** $0.002
- **External deps:** Ongoing data maintenance

### 18. Patent Search
- **Endpoints:** GET /v1/patents/search
- **Inputs:** query, source (uspto/epo/wipo), date_range, limit
- **Output:** Patent results with title, abstract, inventors, assignee, dates, classifications
- **Tech:** USPTO/EPO API integration
- **Build time:** 4-5 days
- **Cost per call:** $0.02
- **External deps:** USPTO/EPO (free)

### 19. Paper Search
- **Endpoints:** GET /v1/papers/search
- **Inputs:** query, source (arxiv/pubmed/semantic-scholar/all), limit
- **Output:** Papers with title, authors, abstract, citations, DOI, PDF URL
- **Tech:** arXiv/Semantic Scholar API wrappers
- **Build time:** 3-4 days
- **Cost per call:** $0.01
- **External deps:** Free APIs

### 20. Company Data
- **Endpoints:** GET /v1/company/lookup
- **Inputs:** domain or company name
- **Output:** Company profile (founded, employees, funding, revenue, tech stack, key people, competitors, social)
- **Tech:** Multi-source aggregation
- **Build time:** 4-5 days
- **Cost per call:** $0.02
- **External deps:** Public data sources

### 21. Product Scraper
- **Endpoints:** POST /v1/product/extract
- **Inputs:** Product URL (amazon/ebay/shopify/walmart)
- **Output:** Structured product data (title, price, images, description, specs, rating, reviews, stock)
- **Tech:** Marketplace-specific extractors
- **Build time:** 4-5 days
- **Cost per call:** $0.01-0.02
- **External deps:** None

### 22. Sentiment Analyzer
- **Endpoints:** POST /v1/sentiment/analyze
- **Inputs:** texts[], optional aspect_extraction (bool)
- **Output:** overall sentiment, score, aspects[], emotions[]
- **Tech:** Fine-tuned sentiment model + aspect extraction
- **Build time:** 3-4 days
- **Cost per call:** $0.002
- **External deps:** None (self-hosted model)

### 23. Resume Parser
- **Endpoints:** POST /v1/resume/parse
- **Inputs:** Resume file URL (PDF/DOCX/image)
- **Output:** Structured candidate data (name, email, phone, skills, experience[], education[])
- **Tech:** PDF/DOCX parsing + NER model
- **Build time:** 4-5 days
- **Cost per call:** $0.03-0.05
- **External deps:** None (self-hosted NER)

### 24. Salary Data
- **Endpoints:** GET /v1/salary/lookup
- **Inputs:** job title, location, experience_years
- **Output:** salary_range (p25/p50/p75/p90), total_comp_range, data_source, confidence
- **Tech:** Public data aggregation + scraping
- **Build time:** 4-5 days
- **Cost per call:** $0.02
- **External deps:** Ongoing data enrichment

### 25. Tax Rate Lookup
- **Endpoints:** GET /v1/tax/rate
- **Inputs:** country, state, city, tax_type
- **Output:** combined_rate, breakdown (state/county/city/special), effective_date
- **Tech:** Public tax rate database
- **Build time:** 3-4 days
- **Cost per call:** $0.005
- **External deps:** Public data (free)

### 26. Invoice/Receipt OCR
- **Endpoints:** POST /v1/ocr/invoice, POST /v1/ocr/receipt
- **Inputs:** Document file URL (PDF/image)
- **Output:** Structured data (vendor, invoice_number, date, total, tax, line_items[])
- **Tech:** OCR + layout analysis + NER
- **Build time:** 4-5 days
- **Cost per call:** $0.01-0.03
- **External deps:** None (self-hosted OCR)

### 27. Calendar Availability
- **Endpoints:** POST /v1/calendar/find-slots
- **Inputs:** calendar_emails[], duration_min, date_range, working_hours, timezone
- **Output:** available_slots[] with start/end times
- **Tech:** Google Calendar + Outlook API integration
- **Build time:** 3-4 days
- **Cost per call:** $0.005
- **External deps:** Google/Microsoft API access

### 28. Code Runner
- **Endpoints:** POST /v1/code/run
- **Inputs:** language (python/js/shell), code, timeout
- **Output:** output, error, execution_time_ms, exit_code
- **Tech:** Docker sandboxing + language runtimes
- **Build time:** 4-5 days
- **Cost per call:** $0.001-0.005
- **External deps:** Docker runtime

### 29. Mock API Server
- **Endpoints:** POST /v1/mock/create, GET /v1/mock/{id}, DELETE /v1/mock/{id}
- **Inputs:** endpoints[] (method, path, status, response), expires_in
- **Output:** mock_url, endpoints list, expires_at
- **Tech:** Dynamic HTTP server
- **Build time:** 2-3 days
- **Cost per call:** $0.005/mock creation
- **External deps:** None

---

## Build Summary

| Category | APIs | Total Build Time |
|----------|------|-----------------|
| Commodity | 9 | 11 days |
| High Demand | 7 | 25 days |
| First-to-Market | 13 | 52 days |
| **Total** | **29** | **88 dev-days** |

With 3 parallel Claude Code sessions: ~30 calendar days
