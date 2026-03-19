# NOVATerra — Technical Scaling Notes
**Created: February 25, 2026**

---

## CURRENT ARCHITECTURE
- React + Zustand + IndexedDB (offline-first) + Supabase (cloud sync + auth)
- Hosted on Vercel | AI via Claude API
- Three.js for 3D visualization | pdf.js for PDF processing

## CAPACITY LIMITS
| Component | Comfortable Limit | Hard Limit |
|---|---|---|
| IndexedDB per user | 1-5 GB | 60% of disk (Chrome) |
| Three.js models @ 60 FPS | ~50 MB compressed | GPU-dependent |
| Zustand store items | Tens of thousands | Split stores at 100K+ |
| Vercel Pro bandwidth | 1 TB/month | Overage at $0.15/GB |
| Supabase Pro DB | 8 GB | Addons available |

## AI COSTS (OPTIMIZED)
| Operation | Cost |
|---|---|
| Single plan scan (3-phase) | $0.50-0.90 |
| 5,000 scans/month (1K users) | $800-1,500 (with caching) |
| Without caching | $2,750-4,500 |

### Optimization Levers
1. Prompt caching: 60-80% savings on input tokens
2. Tiered models: Haiku detect → Sonnet parse → Sonnet ROM
3. Batch API: 50% discount for non-realtime
4. Result caching: fingerprint PDFs, never re-scan same doc

## INFRASTRUCTURE COSTS AT SCALE
| Users | Monthly Cost |
|---|---|
| 50 | ~$95-245 |
| 500 | ~$570-2,200 |
| 2,000 | ~$2,250-10,800 |
| 10,000 | ~$10,800-52,500 |

## FEATURE FEASIBILITY
| Feature | Feasible? | Effort | Cost Impact |
|---|---|---|---|
| Collaborative editing (Yjs) | Yes | 4-8 weeks | $10-20/mo WS server |
| IFC/BIM parsing (web-ifc) | Yes | 6-12 weeks | $0 (open source) |
| Voice-to-estimate | Yes | 4-6 weeks | $100-150/mo at scale |
| Mobile/tablet | Responsive web enough | Minimal | $0 |
| Custom fine-tuned AI model | Yes | 2-3 months | $500-5K training |
| RAG pipeline (pgvector) | Yes | 2-4 weeks | $0 (Supabase included) |

## ARCHITECTURE RECOMMENDATIONS
- Stay as web SPA (zero-friction onboarding critical for growth)
- Stay monolithic until 10K+ users / 5+ developers
- Plan Vercel exit at 10K+ users → Cloudflare Pages + Workers
- Move large files to Cloudflare R2 at scale ($0.015/GB, zero egress)
- Extract AI processing service at 10K+ scans/month
