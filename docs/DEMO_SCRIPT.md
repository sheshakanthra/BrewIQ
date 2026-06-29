# 🎬 BrewIQ — 2-Minute Demo Script

**Runtime:** 2:00 · **Resolution:** 1080p (record at 1920×1080) · **Tool:** OBS or Loom · **Voice:** calm, confident, ~150 wpm

---

## ✅ Pre-Flight Checklist (do this BEFORE you hit record)

1. **Both servers running** — backend on `:8000`, frontend on `:5173`. Header badge should be **green "Live."**
2. **Reset to a clean state** — open the **Demo** button (top-right) → **"Reset to seed data."** This guarantees oat milk/cups/beans are in the known low-but-not-critical state.
3. **GROQ_API_KEY set** (optional but recommended) — makes the briefing and chat use real Llama 3.3 streaming. Without it, the rule-based fallback still demos perfectly.
4. **Browser:** full-screen (F11), zoom 100%, hide bookmarks bar, close other tabs.
5. **Do one full practice run** — especially the typing in the final beat.
6. Mute notifications. Pre-type the chat question in a notepad so you can paste if needed.

> 🎯 **The money shot is the streaming chat at 1:15.** Everything builds to it. Let it breathe.

---

## [0:00 – 0:15] 🪝 HOOK

| | |
|---|---|
| **Screen** | Dashboard finishing its load animation — KPI numbers counting up, charts drawing in. |
| **Trigger** | _(none — just let the load animation play)_ |
| **Say** | "Every morning, the owner of The Daily Grind coffee shop used to spend an hour reviewing spreadsheets, checking inventory, and figuring out who to call in for the morning rush. **BrewIQ changes that.** Here's how." |
| **Director note** | Start recording with the page already mid-load so the count-up animation is the first thing on screen. Don't move the mouse yet. |

---

## [0:15 – 0:35] 🧠 AI BRIEFING

| | |
|---|---|
| **Screen** | Dashboard — the **"☕ AI Daily Briefing"** card. |
| **Say** | "The moment the shop opens, BrewIQ has already analyzed the previous day. It reads through every order, checks inventory levels, and gives a plain-English briefing. Right now it's flagging that **oat milk is critically low**, and the **8-to-9am rush is understaffed**." |
| **Action** | Click **"Refresh Briefing."** Let the skeleton shimmer show for a beat, then the text reappears. |
| **Director note** | Hover/point the cursor at the words "37.5%" and the alert count as you say "analyzed the previous day." Slow, deliberate mouse movement. |

---

## [0:35 – 0:55] 🔴 LIVE RUSH SIMULATION

| | |
|---|---|
| **Screen** | Dashboard — the **"Live Orders"** feed (pulsing green dot). |
| **Say** | "Here's the real-time order feed. Let me simulate a morning rush." |
| **Trigger** | **Demo** button → **"Trigger morning rush."** |
| **Screen (cont.)** | Orders slide in from the top of the feed; the KPI count climbs; the revenue chart ticks up. |
| **Say** | "Look at the order volume spike — eight to twelve orders landing in seconds. **BrewIQ captures all of this in real time**, no manual entry." |
| **Director note** | After clicking Trigger, **move your cursor away** and let the feed animate untouched for ~3 seconds. The slide-in animation sells it. |

---

## [0:55 – 1:15] ⚠️ INVENTORY ALERTS

| | |
|---|---|
| **Screen** | Click **Inventory** in the sidebar (page fades in). |
| **Trigger** | _(Optional, for a guaranteed critical state:)_ Demo button → **"Trigger low-stock alert"** _before_ navigating — this crashes oat milk to 0.5 and arms the red banner. |
| **Say** | "That rush just burned through our oat milk — and BrewIQ detected it immediately." |
| **Screen (cont.)** | The **red critical banner** pulses at the top ("3 items critically low…"). |
| **Action** | Scroll to the AI panel → click **"Generate Recommendations."** |
| **Screen (cont.)** | Loading line cycles ("Reading 7-day burn rates… Calculating reorder quantities…"), then reorder cards appear. Click **"Show AI reasoning"** on one card to reveal the tool calls. |
| **Say** | "BrewIQ calculates **exactly how much to order** — based on our real burn rate and supplier lead time — and shows its work: the AI is calling functions to compute the quantity and the cost." |
| **Director note** | Expanding the reasoning steps is the proof-of-substance moment. Pause on it for ~2 seconds. |

---

## [1:15 – 1:40] 💬 ASK BREWIQ  ⭐ _(the highlight)_

| | |
|---|---|
| **Screen** | Click **AI Hub** in the sidebar. |
| **Say** | "But the most powerful feature is just… asking." |
| **Action** | Click the chat input. Type slowly: **"How was last week compared to the week before?"** Press Enter. |
| **Screen (cont.)** | The answer **streams in token by token** with a blinking cursor — real numbers, formatted in bold. |
| **Say** | "BrewIQ has full context of our business — sales, staffing, inventory. It's like having an operations manager who never sleeps, and it answers in **real time**." |
| **Director note** | **Do not talk over the first second of streaming.** Let the tokens appear in silence for a beat — that's the wow. Then deliver the line as it finishes. If you have a Groq key, this is sub-second; if not, the fallback streams at a readable pace. |

---

## [1:40 – 2:00] 🎯 CLOSE

| | |
|---|---|
| **Screen** | Click **Dashboard** for a final sweeping overview — charts, KPIs, live feed all on one screen. |
| **Say** | "BrewIQ doesn't just track data — it **understands your café**. From managing inventory, to predicting rushes, to answering questions in plain English, BrewIQ is the AI operations partner every independent coffee shop deserves." |
| **Screen (cont.)** | Cut to a clean end-card: the BrewIQ logo + **`brewiq.vercel.app`** + **`github.com/sheshakanthra/BrewIQ`**. |
| **Say** | "Try it live at **brewiq-dot-vercel-dot-app**. Thank you." |
| **Director note** | Hold the end-card for 2–3 seconds of silence so the URL registers. Fade to black. |

---

## 🎙️ Narration Pacing Cheat-Sheet

| Beat | Words | Target time |
|---|---|---|
| Hook | ~40 | 15s |
| AI Briefing | ~45 | 20s |
| Rush Sim | ~40 | 20s |
| Inventory | ~50 | 20s |
| Ask BrewIQ | ~45 | 25s |
| Close | ~55 | 20s |

Total ≈ 275 words → comfortably under 2:00 at ~150 wpm, leaving room for the "let it breathe" pauses.

---

## 💡 Production Tips

- **Record video and audio separately** if you can — film a clean screen run first (no talking), then narrate over it. Lets you nail timing without fumbling clicks.
- **Speak slowly and clearly.** The instinct under pressure is to rush; resist it.
- **One cursor, deliberate moves.** Never let the mouse wander while you talk.
- **The streaming chat is the climax** — protect that silence at 1:15.
- **Have a fallback recording** of the rush + chat in case live triggers misfire on take day.
- **Export at 1080p, 30fps**, MP4 (H.264). Keep it under the BeanHacks size limit.
- If you want captions, add them — judges often watch muted on a first pass.

---

## 🔧 Demo Trigger Reference

All triggers live behind the **Demo** button in the top-right header (requires `DEMO_MODE=true`):

| Button | What it does | Used in beat |
|---|---|---|
| **Start live order stream** | Streams ~1 order every 30–45s (more during rush hours) | _(ambient — optional pre-roll)_ |
| **Trigger morning rush** | Fires 8–12 orders in rapid succession (2–3s apart) | 0:35 Rush Sim |
| **Trigger low-stock alert** | Crashes oat milk to 0.5 → arms critical banner + urgent reorder rec | 0:55 Inventory |
| **Reset to seed data** | Restores the clean 30-day demo dataset | Pre-flight |

> Run **Reset to seed data** between takes to return to a known-good starting state.
