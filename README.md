# 🏟️ SportCourt — Sports Court Booking System

A full-stack web application for booking sports courts with real-time availability, coin-based payments, QR code check-ins, and an admin management panel.

---

## 🔗 Live Links

| Service | URL |
|---------|-----|
| 🌐 Frontend (Netlify) | [https://tourmaline-tulumba-4614bf.netlify.app/](https://tourmaline-tulumba-4614bf.netlify.app/) |
| ⚙️ Backend API (Render) | [https://sport-court-backend.onrender.com](https://sport-court-backend.onrender.com) |

> **⚠️ Note for interns:** The backend is hosted on Render's **free tier**. It will **sleep after 15 minutes of inactivity** and may take **20–30 seconds to wake up** on the first request. This is normal — just wait and refresh.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started (Local Development)](#getting-started-local-development)
- [Environment Variables](#environment-variables)
- [How the App Works](#how-the-app-works)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [User Roles](#user-roles)
- [Business Rules](#business-rules)
- [Common Issues & Fixes](#common-issues--fixes)

---

## Project Overview

SportCourt lets users browse and book sports courts (tennis, basketball, football, futsal) online. It uses a **virtual coin wallet** as the payment system. Admins can manage courts, view analytics, handle maintenance, and scan QR codes for user check-ins.

### Architecture

```
[User's Browser]
      │
      ▼
[Frontend — Netlify]          ← HTML / CSS / JavaScript
https://tourmaline-tulumba-4614bf.netlify.app/
      │
      │  HTTP requests (fetch API)
      ▼
[Backend API — Render]        ← Node.js / Express
https://sport-court-backend.onrender.com/api
      │
      ▼
[MySQL Database]              ← Cloud-hosted, SSL connection
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| HTML / CSS / Vanilla JS | Pages and interactivity |
| Chart.js | Admin analytics charts |
| Google Fonts (Barlow) | Typography |

### Backend
| Technology | Purpose |
|-----------|---------|
| Node.js + Express | REST API server |
| mysql2/promise | MySQL database queries |
| bcrypt | Password hashing |
| jsonwebtoken (JWT) | Authentication tokens |
| qrcode | QR code generation |
| jsPDF | PDF receipt generation |
| dotenv | Environment variable management |
| cors | Allow frontend to call the API |
| node-cron | Scheduled jobs (auto no-show detection) |

---

## Project Structure

```
sportcourt/
│
├── server.js                   # App entry point — starts server on port 4000
│
├── src/
│   ├── app.js                  # Express setup, CORS config, route mounting
│   │
│   ├── config/
│   │   └── db.js               # MySQL connection pool (reads from .env)
│   │
│   ├── controllers/            # Business logic for each feature
│   │   ├── adminController.js        # Courts, maintenance, bookings, stats
│   │   ├── authController.js         # Register & login
│   │   ├── bookingController.js      # Book, cancel, check-in, check-out
│   │   └── notificationController.js # Get & mark notifications
│   │
│   ├── middlewares/            # Request interceptors
│   │   ├── authMiddleware.js         # Verifies JWT token on every request
│   │   └── adminMiddleware.js        # Blocks non-admin users from admin routes
│   │
│   ├── routes/                 # URL routing — maps endpoints to controllers
│   │   ├── adminRoutes.js            # /api/admin/*
│   │   ├── authRoutes.js             # /api/auth/*
│   │   ├── bookingRoutes.js          # /api/bookings/*
│   │   ├── courtRoutes.js            # /api/courts/*
│   │   ├── notificationRoutes.js     # /api/notifications/*
│   │   └── userRoutes.js             # /api/users/*
│   │
│   ├── utils/                  # Reusable helper functions
│   │   ├── bookingUtils.js           # generateQRCode(), generatePDF()
│   │   └── notificationUtils.js      # createNotification() helper
│   │
│   └── cron/
│       └── noShowJob.js        # Runs every minute — marks no-shows automatically
│
└── frontend/                   # Static files deployed to Netlify
    ├── index.html              # Login page
    ├── register.html           # Register page
    ├── css/
    │   ├── style.css
    │   └── alerts.css
    ├── js/
    │   ├── api.js              # Base API URL + apiFetch() helper + showAlert()
    │   ├── auth.js             # login(), logout(), checkAuth(), checkAdminAuth()
    │   ├── notifications.js    # Notification polling + display
    │   └── topup.js            # Coin top-up modal logic
    │
    ├── user/                   # Pages for regular users
    │   ├── dashboard.html      # Home — balance, upcoming bookings
    │   ├── courts.html         # Browse & filter courts
    │   ├── booking.html        # Book a court (step-by-step)
    │   ├── bookings.html       # Booking history
    │   ├── favorites.html      # Saved favorite courts
    │   ├── receipt.html        # Booking receipt + QR code
    │   └── profile.html        # Profile settings + top-up
    │
    └── admin/                  # Pages for admins only
        ├── dashboard.html      # Analytics overview + charts
        ├── courts.html         # Manage courts + maintenance
        ├── bookings.html       # View & cancel all bookings
        ├── scanner.html        # Camera QR scanner for check-in
        └── profile.html        # Admin profile
```

---

## Getting Started (Local Development)

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-username/sportcourt.git
cd sportcourt
```

### Step 2 — Install Dependencies

```bash
npm install
```

### Step 3 — Set Up Environment Variables

Create a `.env` file in the root of the project (see [Environment Variables](#environment-variables) section below).

### Step 4 — Start the Backend Server

```bash
node server.js
```

You should see:
```
Server running on port 4000
```

The API is now available at: `http://localhost:4000`

### Step 5 — Run the Frontend

Open the `frontend/` folder with a local dev server. The easiest way is the **VS Code Live Server** extension — just right-click `index.html` and click "Open with Live Server".

Or use the terminal:
```bash
npx serve frontend/
```

Then open `http://localhost:3000` in your browser.

### Step 6 — Point the Frontend to Your Local API (Optional)

If you want the frontend to use your local backend instead of the live Render server, open `frontend/js/api.js` and change:

```js
// From:
const API_BASE = "https://sport-court-backend.onrender.com/api";

// To:
const API_BASE = "http://localhost:4000/api";
```

---

## Environment Variables

Create a `.env` file in the **project root** with the following values:

```env
# Server Port
PORT=4000

# MySQL Database
DB_HOST=your-database-host
DB_PORT=3306
DB_USER=your-database-username
DB_PASSWORD=your-database-password
DB_NAME=your-database-name

# JWT Secret (use a long random string)
JWT_SECRET=your-super-secret-key-here
```

> **Never commit your `.env` file to Git.** Make sure `.env` is listed in `.gitignore`.

---

## How the App Works

### Login Flow
1. User enters email and password on the login page
2. Frontend sends a `POST /api/auth/login` request
3. Backend verifies credentials and returns a **JWT token** + user info
4. Token is saved in `localStorage`
5. User is redirected based on their role — `user` → user dashboard, `admin` → admin dashboard

### Booking Flow
1. User browses courts on `courts.html` and clicks **Book Now**
2. User selects a date, start time, and end time
3. Frontend checks availability via `POST /api/bookings/availability`
4. Frontend locks the slot for 10 minutes via `POST /api/bookings/lock` (prevents double-booking)
5. User confirms → `POST /api/bookings/book` deducts coins and creates the booking
6. Admin scans user's QR code → booking status changes to `confirmed`
7. After the session ends, checkout is called → booking status becomes `completed`

### Notification Flow
- Notifications are polled from the server every **30 seconds**
- A bell icon with a badge shows the unread count in the navbar
- Users can click to open the notification panel and mark items as read

---

## API Reference

**Base URL:** `https://sport-court-backend.onrender.com/api`

All protected routes require this HTTP header:
```
Authorization: Bearer <your_jwt_token>
```

---

### 🔐 Auth — `/api/auth`

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|-------------|
| POST | `/register` | ❌ | Create a new user account |
| POST | `/login` | ❌ | Login and get a JWT token |

---

### 🏟️ Courts — `/api/courts`

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|-------------|
| GET | `/` | ❌ | Get all active courts |
| GET | `/type/:type` | ❌ | Get courts filtered by type |

---

### 📅 Bookings — `/api/bookings`

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|-------------|
| POST | `/availability` | ✅ | Check if a time slot is free |
| POST | `/lock` | ✅ | Lock a slot for 10 minutes |
| POST | `/book` | ✅ | Create booking and pay with coins |
| POST | `/cancel/:id` | ✅ | Cancel booking and get a refund |
| POST | `/checkout/:id` | ✅ | Check out after your session |
| GET | `/my-bookings` | ✅ | Get your booking history |
| GET | `/:id` | ✅ | Get one booking by ID (for receipt) |

---

### 🔔 Notifications — `/api/notifications`

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|-------------|
| GET | `/` | ✅ | Get your notifications |
| PUT | `/read-all` | ✅ | Mark all as read |
| PUT | `/:id/read` | ✅ | Mark one notification as read |

---

### 👤 Users — `/api/users`

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|-------------|
| GET | `/me` | ✅ | Get your profile and coin balance |
| POST | `/topup` | ✅ | Add coins to your wallet |
| PUT | `/me/password` | ✅ | Change your password |
| DELETE | `/me` | ✅ | Delete your account |

---

### 🛠️ Admin — `/api/admin`

> All admin routes require the user to have `role: "admin"` in the JWT token.

**Court Management**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/courts` | Get all courts (including inactive) |
| POST | `/courts` | Create a new court |
| PUT | `/courts/:id` | Update court name, type, price, or status |

**Maintenance**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/courts/:id/maintenance` | Schedule maintenance — auto-cancels affected bookings and refunds users |
| GET | `/maintenance` | Get all scheduled maintenance |
| DELETE | `/maintenance/:id` | Remove a maintenance schedule |

**Booking Management**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookings` | Get all bookings in the system |
| GET | `/bookings/pending` | Get only pending/active bookings |
| POST | `/bookings/:id/confirm` | Confirm check-in via QR scan |
| DELETE | `/bookings/:id` | Force cancel a booking (refunds user) |

**Penalties**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/penalties` | Get all users with active penalties |
| POST | `/penalties/:id/resolve` | Clear a user's penalty |

**Statistics**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats/dashboard` | Summary stats (revenue, bookings, courts, cancellation rate) |
| GET | `/stats/high-demand` | Most booked courts |
| GET | `/stats/peak-hours` | Booking count by hour of day |
| GET | `/stats/cancellation-rate` | Overall cancellation percentage |
| GET | `/stats/revenue` | Daily revenue for the last 30 days |

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| name | VARCHAR | Display name |
| email | VARCHAR | Unique |
| password_hash | VARCHAR | Hashed with bcrypt |
| role | ENUM | `user` or `admin` |
| coin_balance | INT | Virtual wallet |
| penalty | INT | Added to next booking cost |

### `courts`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| name | VARCHAR | Court display name |
| type | ENUM | `tennis`, `basketball`, `football`, `futsal` |
| price_per_hour | INT | Coins per hour |
| is_active | BOOLEAN | `0` = hidden from users |

### `bookings`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| user_id | INT FK | → `users.id` |
| court_id | INT FK | → `courts.id` |
| date | DATE | Booking date |
| start_time | TIME | Start of session |
| end_time | TIME | End of session |
| status | ENUM | `booked` → `confirmed` → `completed` / `cancelled` / `no_show` |
| total_price | INT | Coins charged |
| checked_in | BOOLEAN | Set to `1` on QR scan |
| qr_code | VARCHAR | Used for check-in scan |

### `court_maintenance`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| court_id | INT FK | → `courts.id` |
| start_date | DATE | |
| end_date | DATE | |
| reason | VARCHAR | Description |

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| user_id | INT FK | → `users.id` |
| title | VARCHAR | Short title |
| message | TEXT | Full message |
| is_read | BOOLEAN | Default `0` |
| created_at | DATETIME | Auto-set |

### `slot_locks`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| court_id | INT FK | → `courts.id` |
| date | DATE | |
| start_time | TIME | |
| end_time | TIME | |
| expires_at | DATETIME | Auto-expires after 10 minutes |

---

## User Roles

### Regular User
- Logs in and lands on `user/dashboard.html`
- Can only see and manage their own bookings, profile, and notifications
- All routes protected by `authMiddleware`

### Admin
- Logs in and lands on `admin/dashboard.html`
- Can manage all courts, all bookings, view analytics, and scan QR codes
- All admin routes protected by both `authMiddleware` + `adminMiddleware`
- If a non-admin tries to access `/api/admin/*`, they get a `403 Forbidden` error

---

## Business Rules

### Penalty System

| Situation | Penalty Applied |
|-----------|----------------|
| User does not check in within 15 min of booking start | +100 coins on next booking |
| User checks out more than 15 min after booking end time | +50 coins on next booking |

Penalties are automatically **deducted from the user's coin balance** when they make their next booking, then reset to 0.

### No-Show Detection
A **cron job** runs automatically in the background. Every minute it checks for bookings where:
- Status is still `booked` (not confirmed/checked in)
- The booking start time was more than 15 minutes ago

Those bookings are marked `no_show`, the user is penalized 100 coins, and they receive a notification. **No refund is issued for no-shows.**

### Maintenance Auto-Cancellation
When an admin schedules court maintenance:
1. All `booked` bookings during the maintenance period are automatically cancelled
2. Each affected user receives a **full coin refund**
3. Each affected user receives a notification explaining the cancellation

---

## Common Issues & Fixes

**API returns no data or times out on first load**
The Render backend sleeps when inactive. Wait 20–30 seconds and try again.

**401 Unauthorized errors**
The JWT token in `localStorage` has expired (tokens last 7 days). Log out and log back in.

**403 Forbidden on admin pages**
Your account does not have `role: "admin"` in the database. Ask the project owner to update your role.

**Frontend shows old data after changes**
The frontend caches nothing — try a hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).

**Cannot connect to database locally**
Double-check your `.env` file values. Make sure the database server allows connections from your IP address (check cloud DB firewall/allowlist settings).

---

## License

This project is for educational and internship purposes.

---

> Made with ❤️ — SportCourt © 2026
