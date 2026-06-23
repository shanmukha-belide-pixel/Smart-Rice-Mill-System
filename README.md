# 🌾 Sri Tirumala Rice Mill App

A modern, high-performance Queue & Inventory Management system custom-tailored for **Sri Tirumala Rice Mill**  

Designed to optimize customer throughput, automate rice stock levels, handle bilingual operations, and generate instant printable receipts.

---

## ✨ Key Features

1. **⚡ Real-Time Token Board:** Manage live counter allocations, FIFO customer queue flows, and immediate screen announcements.
2. **🗣️ Bilingual UI (Telugu Default):** Defaults entirely to Telugu (`te`) to cater to local operators and customers, with a one-click globe switch to English (`en`).
3. **📊 Dynamic UPI Payments:** Generates exact-value merchant UPI payment QR codes (`PA: 7075295440@ybl` - *Belide Shanmukha Srinivas*) for seamless digital checkouts.
4. **📸 simulated Receipt Scanner:** Integrates an overlay scanner layout mimicking camera scanning of customer payment receipts.
5. **🖨️ Printable Thermal Receipts:** Displays a paper-like payment ticket upon checkout with standard **80mm media styling** for thermal receipt printers.
6. **📈 Financial Reports & Analytics:** Features daily metrics (total revenue, tokens served, no-show rate) and a weekly revenue trend **Bar Chart** driven by real database sales.
7. **📦 Offline-Capable Flutter App:** Dart/Flutter companion code in `/vendor-mobile-app` for operators on the go.

---

## 🛠️ Technology Stack

* **Frontend:** React.js, Vite, TailwindCSS (configured with customized emerald/glassmorphism design tokens), Recharts (data visualizations), Lucide Icons.
* **Backend:** FastAPI (Python), Uvicorn ASGI Server, SQLAlchemy ORM.
* **Database:** SQLite (lightweight, zero-config local relational database).

---


   *Open **`http://localhost:5173`** (or your local network IP) to access the console!*

---


