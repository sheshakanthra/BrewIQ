<div align="center">

# BrewIQ ☕

### AI-Powered Operations Dashboard for Coffee Shops

> Built for BeanHacks 2026 — _From bean to build!_

[![Live Demo](https://img.shields.io/badge/Live_Demo-brewiq.vercel.app-C8893A?style=for-the-badge&logo=vercel&logoColor=white)](https://brewiq.vercel.app)
[![GitHub stars](https://img.shields.io/github/stars/sheshakanthra/BrewIQ?style=for-the-badge&color=C8893A&logo=github)](https://github.com/sheshakanthra/BrewIQ/stargazers)
[![Powered by Groq](https://img.shields.io/badge/Powered_by-Groq_+_Llama_3.3-F55036?style=for-the-badge&logo=meta&logoColor=white)](https://groq.com)

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-A89880?style=flat-square)](LICENSE)

</div>

---

## ❓ The Problem

Independent coffee shop owners run their operations on gut feel and a tangle of spreadsheets — guessing when to staff up, scrambling when the oat milk runs out mid-rush, and never really knowing _why_ yesterday was slow. That manual, reactive grind costs them money in wasted stock, missed sales, and over- or under-staffed shifts every single day.

## 💡 Our Solution

**BrewIQ turns a coffee shop's raw operational data into a 24/7 AI operations manager.**

- 🧠 **Sees everything** — unifies orders, inventory, and staffing into one live dashboard.
- 🔮 **Thinks ahead** — predicts rush hours, projects stock-outs from real burn rates, and flags understaffed shifts before they happen.
- 💬 **Talks back** — answers plain-English questions about the business and writes a fresh briefing every morning, all grounded in the shop's actual numbers.

---

## 🎬 Demo

<div align="center">

[![Watch the BrewIQ demo](https://img.shields.io/badge/▶_Watch_the_2--min_Demo-E05252?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/your-demo-link)

_Click above for the full walkthrough — or explore the [live app](https://brewiq.vercel.app)._

<br/>

<!-- Replace these with real screenshots in /docs once captured -->
| Operations Dashboard | AI Daily Briefing | Inventory Alerts |
| :---: | :---: | :---: |
| ![Dashboard](docs/screenshot-dashboard.png) | ![AI Briefing](docs/screenshot-briefing.png) | ![Inventory](docs/screenshot-inventory.png) |
| _Live KPIs, rush heatmap & order feed_ | _Groq-written morning briefing_ | _Burn-rate alerts + AI reorder_ |

</div>

> 📸 **Judges:** screenshots live in `/docs`. The app ships with 30 days of realistic seed data for **"The Daily Grind,"** a campus coffee shop — so every chart, alert, and AI answer is populated out of the box.

---

## ✨ Features

- ☕ **AI Daily Briefing** — BrewIQ analyzes yesterday's data and briefs the owner every morning.
- 📊 **Rush Hour Heatmap** — 30-day order density visualization to optimize staffing.
- ⚠️ **Smart Inventory Alerts** — Burn-rate analysis with AI reorder recommendations.
- 💬 **Ask BrewIQ** — Natural language Q&A with your café's data, powered by Groq (Llama 3.3).
- 📅 **Staff Coverage Analysis** — Compare actual staffing to predicted demand.
- 🔴 **Live Order Feed** — Real-time order stream with auto-refresh.

---

## 🧱 Tech Stack

| Layer    | Technology                                                              |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts                       |
| Backend  | FastAPI, Python, SQLite, SQLAlchemy                                      |
| AI       | Groq + Llama 3.3 70B — briefings, function calling, streaming chat       |
| Deploy   | Render (backend), Vercel (frontend)                                      |

---

## 🚀 Quick Start

> **Prerequisites:** Python 3.11+ and Node 18+. A free [Groq API key](https://console.groq.com/keys) is optional — BrewIQ falls back to rule-based intelligence without one, so it always runs.

```bash
# 1. Clone
git clone https://github.com/sheshakanthra/BrewIQ.git
cd BrewIQ
```

**Backend** (FastAPI · http://localhost:8000)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

cp .env.example .env          # add your GROQ_API_KEY (optional)
python seed_data.py           # load 30 days of demo data
uvicorn main:app --reload     # → http://localhost:8000/docs
```

**Frontend** (React + Vite · http://localhost:5173)

```bash
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

Open **http://localhost:5173** — the header badge goes green when it connects to the backend. 🎉

---

## 🤖 How the AI Works

BrewIQ wraps **Groq + Llama 3.3 70B** in three distinct integrations, each grounded in a live snapshot of the shop's data:

1. **📝 Daily Briefing (generation + caching)** — On load, the backend assembles a context snapshot (today vs. yesterday revenue, inventory burn rates, staffing vs. demand, top sellers, anomalies) and asks Groq to write a concise, owner-friendly briefing. Results are cached for 30 minutes so the dashboard never hammers the API.

2. **🛠️ Reorder Assistant (function calling / tool use)** — For low-stock items, BrewIQ gives Groq two tools — `calculate_reorder_quantity` and `estimate_cost` — and runs the full tool-call loop: the model decides what to compute, the backend executes the Python functions with the parsed arguments, results are fed back, and the model returns structured recommendations. Every tool call + result is surfaced in the UI so you can _see the AI's reasoning_.

3. **💬 Ask BrewIQ (streaming chat)** — Questions hit a `StreamingResponse` endpoint that streams Groq's tokens back over `text/plain`. The frontend reads the response body with a `fetch` stream reader and renders the answer token by token with a live cursor — the standout demo moment.

🛡️ **Always-on by design:** every Groq call is wrapped in a deterministic, rule-based fallback. No API key, a network hiccup, or a rate limit never breaks the UI — it degrades gracefully to local analysis computed from the same data.

> 🌐 **Live URLs:** Frontend → [brewiq.vercel.app](https://brewiq.vercel.app) · Backend → [brewiq-backend.onrender.com](https://brewiq-backend.onrender.com) · Health → [`/health`](https://brewiq-backend.onrender.com/health)
> The backend runs on Render's free tier and may cold-start (~30–60s) on the first request.

---

## 📂 Submission Materials

Everything a judge needs to evaluate BrewIQ lives in [`/docs`](docs):

| Document | What's inside |
| -------- | ------------- |
| 🎬 [Demo Script](docs/DEMO_SCRIPT.md) | Shot-by-shot 2-minute video script with timestamps, narration, and demo triggers |
| 🎤 [Pitch Deck](docs/PITCH_DECK.md) | 5-slide deck content (problem → solution → how it works → demo → impact) |
| 📝 [Devpost Write-up](docs/DEVPOST.md) | Full project description, build details, challenges, and what's next |

---

## 👥 Team

**Sheshakanth** — [github.com/sheshakanthra](https://github.com/sheshakanthra)

---

<div align="center">

Made with ☕ and a lot of caffeine for **BeanHacks 2026**.

⭐ _If BrewIQ brewed something good, drop a star!_

</div>
