# ☕ BrewIQ

**AI-powered operations dashboard for coffee shops.** Built for BeanHacks 2026.

BrewIQ gives shop managers a live view of sales, inventory, and staffing — plus an
AI assistant (powered by Groq) that answers plain-English questions grounded in the
shop's real data: *"What should I restock today?"*, *"How are sales trending?"*

---

## 🌐 Live URLs

| Surface  | URL                                                |
| -------- | -------------------------------------------------- |
| Frontend | **https://brewiq.vercel.app**                      |
| Backend  | **https://brewiq-backend.onrender.com**            |
| API docs | https://brewiq-backend.onrender.com/docs           |
| Health   | https://brewiq-backend.onrender.com/health         |

> ⏱️ The backend runs on Render's free tier, which sleeps after ~15 min idle. The
> first request may take ~30–60s to cold-start, then it's fast. The frontend stays
> populated with demo data and reconnects automatically once the backend wakes.

---

## ✨ Features

- **Dashboard** — revenue trend, top sellers, category breakdown, live KPIs (Recharts).
- **Orders** — log sales and review the recent queue.
- **Inventory** — restock items with one tap; low-stock items are flagged automatically.
- **Staff** — manage shifts and who's on the clock.
- **AI Insights** — chat with BrewIQ for grounded, actionable recommendations.
  Works even without an API key thanks to a built-in rule-based fallback.

## 🧱 Tech Stack

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Backend  | FastAPI · SQLAlchemy (SQLite) · Uvicorn · Groq · APScheduler            |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS v3 · Recharts · React Router · Axios · Lucide |

---

## 🚀 Getting Started

### 1. Backend (FastAPI)

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt

# Configure environment (optional — works without a key via fallback)
cp .env.example .env        # then add your GROQ_API_KEY

# Seed the database with demo data
python seed_data.py

# Run the API (http://localhost:8000, docs at /docs)
uvicorn main:app --reload
```

### 2. Frontend (React + Vite)

```bash
cd frontend

npm install

# Optional: point the app at a non-default backend
cp .env.example .env        # VITE_API_URL=http://localhost:8000

npm run dev                 # http://localhost:5173
```

Open **http://localhost:5173** — the dashboard loads live data from the backend.

---

## 🔑 Groq API Key (optional)

The AI Insights page uses [Groq](https://console.groq.com/keys) (free tier). Add your
key to `backend/.env`:

```
GROQ_API_KEY=gsk_...
```

Without a key, BrewIQ falls back to a deterministic rule-based analyst so the demo
always works offline.

---

## 🚀 Deployment

### Backend → Render (free tier)

The repo ships a `backend/render.yaml` blueprint and a `backend/Procfile`.

1. Push the repo to GitHub.
2. On Render: **New → Blueprint**, point it at the repo. If deploying the monorepo,
   set the service **Root Directory** to `backend`.
3. Set the `GROQ_API_KEY` env var in the Render dashboard (it's marked `sync: false`,
   so it's never committed). `DEMO_MODE=true` is set automatically by the blueprint.
4. Render runs:
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health check:** `GET /health` → `{ "status": "ok", "db_records": N }`

The SQLite DB lives at `/tmp/brewiq.db` (Render's disk is ephemeral) and is
**re-seeded on every boot**, so the demo always has 30 days of data.

### Frontend → Vercel

1. On Vercel: **Import Project**, set the **Root Directory** to `frontend`.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. The API URL comes from `frontend/.env.production`
   (`VITE_API_URL=https://brewiq-backend.onrender.com`). Override it in Vercel's
   Environment Variables if your backend URL differs.
4. SPA routing is handled by `frontend/vercel.json` (rewrites) and
   `frontend/public/_redirects` as a fallback.

### Verify after deploy

```bash
curl https://brewiq-backend.onrender.com/health
# → { "status": "ok", "db_records": 2838 }
```

Then open the Vercel URL — the header badge should go **green ("Live")**, the AI
briefing should generate, and all charts render from seed data.

---

## 📁 Project Structure

```
brewiq/
├── backend/
│   ├── main.py            # FastAPI app, CORS, scheduler, routers
│   ├── database.py        # SQLAlchemy engine/session
│   ├── models.py          # ORM models (Order, InventoryItem, StaffMember)
│   ├── schemas.py         # Pydantic schemas
│   ├── routers/           # orders, inventory, staff, ai
│   ├── services/          # ai_service (Groq), analytics
│   ├── seed_data.py       # demo data
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/     # Sidebar, StatCard, Loader, ...
    │   ├── pages/          # Dashboard, Orders, Inventory, Staff, Insights
    │   ├── hooks/          # useApi
    │   ├── types/          # shared TypeScript types
    │   └── utils/          # axios client, formatters
    ├── package.json
    └── vite.config.ts
```

## 🔌 Key API Endpoints

| Method | Endpoint                  | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/api/orders/stats`       | Dashboard KPIs, trends, top items    |
| POST   | `/api/orders`             | Create an order                      |
| GET    | `/api/inventory`          | List inventory (with low-stock flag) |
| PATCH  | `/api/inventory/{id}`     | Adjust stock                         |
| GET    | `/api/staff`              | List staff                           |
| POST   | `/api/ai/ask`             | Ask BrewIQ a grounded question       |
| GET    | `/api/ai/daily-briefing`  | Generate a morning briefing          |

Interactive docs: **http://localhost:8000/docs**

---

Made with ☕ and a lot of caffeine for BeanHacks 2026.
