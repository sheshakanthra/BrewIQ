# 🎤 BrewIQ — BeanHacks 2026 Pitch Deck

**Global design system (apply to every slide):**
- **Background:** `#0F0A06` (espresso-black) with a faint amber radial glow top-right
- **Cards/panels:** `#1A1108`, 1px border `#2A1F12`, rounded corners
- **Accent:** `#C8893A` (crema amber) · **Positive:** `#6B9E6B` (sage) · **Alert:** `#E05252`
- **Text:** headings `#F5EDD6` (cream), body `#A89880` (tan)
- **Fonts:** DM Sans (UI), DM Mono (numbers/stats)
- Logo lockup (coffee-cup icon + "BrewIQ") bottom-left on every slide. Slide number bottom-right.

---

## ☕ SLIDE 1 — Problem

> **Title:** Running a coffee shop is harder than making coffee

**Three pain cards (horizontal, icon on top):**

| ☕ Inventory chaos | ⏰ Staffing guesswork | 📊 Zero business intelligence |
|---|---|---|
| Owners discover they're out of oat milk **mid-rush** | No data on **when rushes actually happen** | Gut feelings replace **real analytics** |

**Bottom band (amber-tinted strip):**
> **60% of independent coffee shops close within 5 years.** Operations inefficiency is a leading cause.

*Design: three equal cards, generous whitespace. The stat sits in a full-width amber/10 strip at the bottom — the only bold color on the slide, so it lands.*
*Speaker note: "These aren't edge cases — they're every single morning."*

---

## 💡 SLIDE 2 — Solution

> **Title:** BrewIQ — AI Operations Intelligence for Coffee Shops
> **Subtitle:** One dashboard that monitors, analyzes, and acts.

**Three columns (Monitor → Analyze → Act, with a faint arrow flow between them):**

| 📋 **MONITOR** | 🧠 **ANALYZE** | ⚡ **ACT** |
|---|---|---|
| Real-time order feed | AI daily briefings | Reorder recommendations |
| Live inventory levels | Rush-hour patterns | Staffing suggestions |
| Staff coverage | Burn-rate analysis | Instant natural-language Q&A |

**Visual:** large dashboard screenshot anchored below the columns (or right-half of slide).

*Design: the three verbs read left-to-right as a pipeline. Use sage for MONITOR, amber for ANALYZE, cream for ACT headers to imply "data → insight → action."*
*Speaker note: "It doesn't just show you data — it tells you what to do about it."*

---

## 🤖 SLIDE 3 — How It Works

> **Title:** Powered by Groq + Llama 3.3 70B

**Three AI features (numbered cards, each with a one-line "what it does"):**

1. **📝 Daily Briefing** — "BrewIQ reads your data every morning and tells you what matters." *(generation + caching)*
2. **🛠️ Tool-Use Reordering** — "The AI calls calculation tools to optimize your supply orders." *(function calling)*
3. **💬 Ask BrewIQ** — "Natural-language Q&A with your actual business data." *(streaming chat)*

**Tech stack callout (mono pill row at bottom):**
`React` · `FastAPI` · `Groq — Llama 3.3` · `SQLite`

**Trust line (small, tan):** Every AI call has a deterministic fallback — it never breaks, even offline.

*Design: number each feature in an amber circle. Put the small "(function calling / streaming)" labels in tan so judges clock the technical depth without clutter.*
*Speaker note: "Three different Groq patterns — generation, tool use, and streaming — not one prompt wearing three hats."*

---

## 🖼️ SLIDE 4 — Demo Gallery

> **Title:** Built and deployed in 48 hours

**2×2 screenshot grid (equal tiles, thin amber border, one-line caption each):**

| ![Dashboard](dashboard.png) **Dashboard + AI briefing** | ![Inventory](inventory.png) **Inventory alerts + AI reorder** |
|---|---|
| ![Heatmap](heatmap.png) **30-day rush-hour heatmap** | ![Chat](chat.png) **Ask BrewIQ — streaming chat** |

**Footer (centered, mono):**
🌐 **Live:** brewiq.vercel.app  ·  💻 **Code:** github.com/sheshakanthra/BrewIQ

*Design: let the screenshots do the talking — minimal text. Add a small "LIVE" green-dot badge near the URL to signal it's actually deployed, not a mockup.*
*Speaker note: "Everything you're seeing is live right now — scan the QR or open the link."* *(Add a QR code to the Vercel URL in the corner — judges love a working link.)*

---

## 🚀 SLIDE 5 — Impact & Next Steps

> **Title:** Real impact for real coffee shops

**Projected metrics (4 stat tiles, big DM Mono numbers):**

| ⏱ **2 hrs/week** | 📈 **15%** | 👥 **Optimal** | 💬 **Instant** |
|---|---|---|---|
| saved on inventory management | less overstock waste | staffing — fewer understaffed rushes | answers replace hours of spreadsheets |

**Next Steps (arrow list, two columns):**
- → POS integration (Square, Toast)
- → Multi-location support
- → Supplier APIs for one-click reordering
- → Mobile app for on-the-go management

**Footer band:**
**Team:** Sheshakanth · github.com/sheshakanthra  |  Built at **BeanHacks 2026** ☕

*Design: the 4 metric numbers are the hero — oversized amber DM Mono. Label "(projected)" in small tan so you're honest with judges. End-card energy: confident, clean.*
*Speaker note: "Today it's one shop's demo. Next it plugs into the POS and runs every café on the block."*

---

## 📐 Build Tips

- **5 slides, ~30 seconds each** if presenting live — rehearse to the demo, not the deck.
- Reuse the **actual app colors** (hex above) so the deck and product feel like one brand.
- **Screenshots > text.** Slides 2 and 4 should be mostly imagery from the real app.
- One bold color per slide max — amber is your spotlight; don't dilute it.
- Capture screenshots at 1080p with the app in its seeded "Daily Grind" state (oat milk critical, 8–9am understaffed) so every panel tells the story.
- Tools: Canva or Figma. Export to PDF for submission; keep a 16:9 ratio.
