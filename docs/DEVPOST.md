# BrewIQ — Devpost Submission

## Project Name
**BrewIQ**

## Tagline
Your AI operations manager — from bean to intelligence.

---

## About the Project

It's 9am at The Daily Grind. The line is out the door, the morning rush is in full swing, and the owner just realized they're almost out of oat milk — their best-selling modifier. This happens not because they're bad at their job, but because running a coffee shop generates **hundreds of micro-decisions every day with no system to support them**. When to staff up. What to reorder, and how much. Why Tuesday was slow. Most owners answer these with gut feel and a tangle of spreadsheets — and 60% of independent shops close within five years, with operational inefficiency a leading cause.

**BrewIQ is an AI operations manager for coffee shops.** It unifies orders, inventory, and staffing into one live dashboard, then layers on an AI brain — powered by **Groq + Llama 3.3 70B** — that reads the shop's real data and tells the owner what actually matters. Groq is the core differentiator here: its blazing-fast inference is what makes the experience feel less like "querying an LLM" and more like talking to a manager who answers instantly.

Three AI features carry the product:

- **📝 Daily Briefing** — every morning, BrewIQ assembles a snapshot of yesterday vs. today, inventory burn rates, staffing vs. predicted demand, and anomalies, then has Groq write a plain-English briefing: *"Oat milk is critically low at ~1.7 days of cover; the 8–9am rush is understaffed — add a third barista."*
- **🛠️ Tool-Use Reordering** — for low-stock items, BrewIQ gives Groq two functions (`calculate_reorder_quantity`, `estimate_cost`) and runs the full function-calling loop, then surfaces every tool call and result in the UI so you can *see the AI's reasoning*.
- **💬 Ask BrewIQ** — a streaming chat where the owner asks *"How was last week compared to the week before?"* and watches the answer type itself out, token by token, grounded in the actual numbers.

### How we built it
- **Backend:** FastAPI + SQLAlchemy over SQLite, with an APScheduler-driven order simulator for live demos.
- **Frontend:** React 18 + TypeScript + Vite, with Recharts visualizations and a dark "espresso" design system in Tailwind CSS.
- **AI:** Groq + Llama 3.3 70B — daily briefings via lightweight RAG over a structured operational snapshot; Groq **function calling** for reorder math; and a `StreamingResponse` endpoint feeding a `fetch` stream reader for **token-by-token chat**.
- **Deploy:** Render (backend) + Vercel (frontend).

### Challenges
- **Real-time streaming** from Groq to the React frontend — getting sub-second tokens to render smoothly meant bypassing axios and reading the raw `ReadableStream`.
- **Designing a meaningful rush-hour heatmap** — turning 30 days of timestamps into a day-of-week × hour density grid that an owner can read at a glance.
- **Balancing AI call frequency with demo speed** — caching briefings for 30 minutes and rate-limiting Groq calls so the app stays snappy and within free-tier limits.

### What we're proud of
- The **streaming Ask BrewIQ** interface — it's the moment that makes people lean in.
- The **tool-use reorder** implementation that shows its work instead of hiding behind a black box.
- Shipping a genuinely useful, deployed product in **48 hours**.

### What we learned
- Groq **function calling is incredibly fast and powerful** for structured, reliable recommendations — far better than parsing free-form text.
- **Seeding realistic demo data is as important as the product itself.** A believable 30-day story ("The Daily Grind") is what makes every chart and AI answer land.

### What's next
- POS integration (Square, Toast), a mobile app, and multi-location support.

🌐 **Live:** https://brewiq.vercel.app  ·  💻 **Code:** https://github.com/sheshakanthra/BrewIQ

---

## Built With
`react` `typescript` `fastapi` `python` `sqlite` `groq` `llama` `recharts` `tailwind-css` `vite` `render` `vercel`
