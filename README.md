# 🌾 Sri Tirumala Rice Mill App

A modern, high-performance Queue & Inventory Management system custom-tailored for **Sri Tirumala Rice Mill** (Hanamkonda, Telangana). 

Designed to optimize customer throughput, automate rice stock levels, handle bilingual operations, and generate instant printable receipts.

---

## ✨ Key Features

1. **⚡ Real-Time Token Board:** Manage live counter allocations, FIFO customer queue flows, and immediate screen announcements.
2. **🗣️ Bilingual UI (Telugu Default):** Defaults entirely to Telugu (`te`) to cater to local operators and customers, with a one-click globe switch to English (`en`).
3. **📊 Dynamic UPI Payments:** Generates exact-value merchant UPI payment QR codes (`PA: 7075295440@ybl` - *Belide Shanmukha Srinivas*) for seamless digital checkouts.
4. **📸 simulated Receipt Scanner:** Integrates an overlay scanner layout mimicking camera scanning of customer payment receipts.
5. **🖨️ Printable Thermal Receipts:** Displays a paper-like payment ticket upon checkout with standard **80mm media styling** for thermal receipt printers.
6. **📈 Financial Reports & Analytics:** Features daily metrics (total revenue, tokens served, no-show rate) and a weekly revenue trend **Bar Chart** driven by real database sales.
7. **📱 Interactive SMS & Call Simulator:** Emulates feature-phone missed calls and SMS commands (`TOKEN`, `PRICE`, `STATUS`, `STOP`) for offline registrations.
8. **📦 Offline-Capable Flutter App:** Dart/Flutter companion code in `/vendor-mobile-app` for operators on the go.

---

## 🛠️ Technology Stack

* **Frontend:** React.js, Vite, TailwindCSS (configured with customized emerald/glassmorphism design tokens), Recharts (data visualizations), Lucide Icons.
* **Backend:** FastAPI (Python), Uvicorn ASGI Server, SQLAlchemy ORM.
* **Database:** SQLite (lightweight, zero-config local relational database).

---

## 🚀 Setup & Installation

### Prerequisites
* Python 3.10+
* Node.js (v18+) & NPM

---

### 1️⃣ Run Backend API
Navigate to the root workspace and follow these steps:

1. Create a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Start the FastAPI uvicorn server:
   ```bash
   python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *The backend will now be live on `http://127.0.0.1:8000` (and `http://localhost:8000`).*

---

### 2️⃣ Run Frontend Web Console
Navigate to the `/frontend` directory:

1. Install npm dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Launch Vite development server:
   ```bash
   npm run dev -- --host
   ```
   *Open **`http://localhost:5173`** (or your local network IP) to access the console!*

---

## 🔑 Default Credentials

Sign in with the custom administrative owner account:
* **Owner/Administrator Dashboard:**
  * **Username:** `Shanmukha`
  * **Password:** `Shanmukha29*`

---

## 📋 Offline SMS Commands (Simulator)

Test these inputs directly in the simulated console screen:
* `TOKEN` - Register a fresh queue spot (responds with estimated wait time and token number).
* `PRICE` - List today's rice variety rates per kg.
* `STATUS` - Track queue position and estimate wait times.
* `STOP` - Cancel your active ticket and opt-out of alerts.

---
