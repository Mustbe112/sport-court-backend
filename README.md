# 🏟️ SportCourt — Sports Court Booking System

A full-stack web application for booking sports courts with real-time availability, coin-based payments, QR code check-ins, automated no-show handling, and a complete admin management panel.

🌐 **Live Demo:** [https://tourmaline-tulumba-4614bf.netlify.app/](https://tourmaline-tulumba-4614bf.netlify.app/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [User Roles](#user-roles)
- [Business Logic](#business-logic)

---

## Overview

SportCourt is a full-stack court booking platform. Users can browse sports courts (tennis, basketball, football, futsal), book sessions using a virtual coin wallet, receive QR codes for check-in, and manage their booking history. Admins get a dedicated panel with analytics charts, court management, maintenance scheduling, and a QR code scanner for check-ins.

The system is split into:
- **Frontend** — Static HTML/CSS/JS hosted on Netlify
- **Backend** — Node.js + Express REST API hosted on Render
- **Database** — MySQL (cloud-hosted, SSL-secured)

---

## Features

### User Features
- 🔐 JWT-based authentication (login & registration)
- 🏟️ Browse & filter courts by type, name, and price
- 📅 Real-time availability check before booking (with maintenance awareness)
- ⏱️ 10-minute slot locking during the booking flow to prevent double-booking
- 💰 Coin-based payment system with top-up support
- 📱 QR code generated on confirmed bookings for check-in
- 🔔 Real-time notifications (confirmations, reminders, cancellations, penalties)
- ⭐ Favorite courts for quick re-booking
- 🧾 Booking receipts with PDF download
- 👤 Profile management, password change, and account deletion

### Admin Features
- 📊 Analytics dashboard — revenue trends, peak hours, court demand (Chart.js)
- 🏟️ Court management — add, edit, activate/deactivate courts
- 🔧 Scheduled court maintenance with automatic cancellation and coin refunds for affected bookings
- 📋 View and force-cancel any booking with automatic user refund
- 📷 Camera-based QR scanner for user check-in validation
- ⚠️ Penalty management — view and resolve user penalties
- 📈 Stats API: high-demand courts, peak hours, revenue over time

### Automated Features
- ⏰ Cron job: auto-marks bookings as `no_show` if user doesn't check in within 15 minutes of start time
- 💸 No-show penalty: 100 coins deducted, no refund issued
- 🕐 Late checkout penalty: 50 coins added to next booking cost

---

## Project Structure

```
sportcourt/
│
├── server.js                        # Entry point — starts Express server + cron
│
├── src/
│   ├── app.js                       # Express app setup, CORS, route mounting
│   │
│   ├── config/
│   │   └── db.js                    # MySQL connection pool (SSL, mysql2/promise)
│   │
│   ├── controllers/
│   │   ├── adminController.js       # Court CRUD, maintenance, bookings, stats
│   │   ├── authController.js        # Register, login (bcrypt + JWT)
│   │   ├── bookingController.js     # Availability, lock, book, cancel, check-in/out
│   │   └── notificationController.js# Get, mark read, mark all read
│   │
│   ├── middlewares/
│   │   ├── authMiddleware.js        # JWT verification — attaches req.user
│   │   └── adminMiddleware.js       # Role check — allows only admin role
│   │
│   ├── routes/
│   │   ├── adminRoutes.js           # /api/admin/* (auth + admin protected)
│   │   ├── authRoutes.js            # /api/auth/register, /api/auth/login
│   │   ├── bookingRoutes.js         # /api/bookings/* (auth protected)
│   │   ├── courtRoutes.js           # /api/courts/* (public)
│   │   ├── notificationRoutes.js    # /api/notifications/* (auth protected)
│   │   └── userRoutes.js            # /api/users/* (auth protected)
│   │
│   ├── utils/
│   │   ├── bookingUtils.js          # QR code generation, PDF receipt generation
│   │   └── notificationUtils.js     # createNotification() helper
│   │
│   └── cron/
│       └── noShowJob.js             # Scheduled job: auto no-show detection
│
└── frontend/                        # Static frontend (deployed to Netlify)
    ├── index.html                   # Login page
    ├── register.html                # Registration
    ├── css/
    │   ├── style.css
    │   └── alerts.css
    ├── js/
    │   ├── api.js
    │   ├── auth.js
    │   ├── notifications.js
    │   └── topup.js
    ├── user/
    │   ├── dashboard.html
    │   ├── courts.html
    │   ├── booking.html
    │   ├── bookings.html
    │   ├── favorites.html
    │   ├── receipt.html
    │   └── profile.html
    └── admin/
        ├── dashboard.html
        ├── courts.html
        ├── bookings.html
        ├── scanner.html
        └── profile.html
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| Node.js + Express | REST API server |
| mysql2/promise | MySQL database driver with connection pooling |
| bcrypt | Password hashing |
| jsonwebtoken | JWT token generation and verification |
| qrcode | QR code generation for bookings |
| jsPDF | PDF receipt generation |
| dotenv | Environment variable management |
| cors | Cross-origin request handling |
| node-cron | Scheduled no-show detection job |

### Frontend
| Technology | Purpose |
|-----------|---------|
| HTML / CSS / Vanilla JS | UI and interactivity |
| Chart.js | Analytics charts on admin dashboard |
| Google Fonts (Barlow) | Typography |

### Infrastructure
| Service | Usage |
|---------|-------|
| Netlify | Frontend hosting |
| Render | Backend API hosting |
| MySQL (Cloud) | Database with SSL |

---

## Getting Started

### Prerequisites
- Node.js v18+
- npm
- MySQL database (local or cloud)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/sportcourt.git
   cd sportcourt
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory (see [Environment Variables](#environment-variables) below).

4. Start the development server:
   ```bash
   node server.js
   ```

   Or with auto-reload using nodemon:
   ```bash
   npx nodemon server.js
   ```

5. The API will be available at `http://localhost:4000`

### Running the Frontend

Open the `frontend/` folder with a local server:
```bash
# Using VS Code Live Server, or:
npx serve frontend/
```

Then visit `http://localhost:3000` (or whichever port is assigned).

> **Note:** The backend on Render's free tier may take ~30 seconds to wake up on the first request.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=4000

# Database
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-db-username
DB_PASSWORD=your-db-password
DB_NAME=your-db-name

# JWT
JWT_SECRET=your-super-secret-jwt-key
```

---

## API Reference

**Base URL:** `https://sport-court-backend.onrender.com/api`

All protected routes require the header:
```
Authorization: Bearer <token>
```

---

### 🔐 Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Register a new user |
| POST | `/login` | ❌ | Login and receive JWT token |

**Login response:**
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "name": "John", "email": "...", "role": "user", "coin_balance": 500 }
}
```

---

### 🏟️ Courts — `/api/courts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | Get all active courts |
| GET | `/type/:type` | ❌ | Filter courts by type |

---

### 📅 Bookings — `/api/bookings`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/availability` | ✅ User | Check if a time slot is available |
| POST | `/lock` | ✅ User | Lock a slot for 10 minutes during checkout |
| POST | `/book` | ✅ User | Create a booking and deduct coins |
| POST | `/cancel/:id` | ✅ User | Cancel a booking and refund coins |
| POST | `/checkout/:id` | ✅ User | Check out (marks booking completed) |
| GET | `/my-bookings` | ✅ User | Get all bookings for the logged-in user |
| GET | `/:id` | ✅ User | Get a single booking by ID (for receipt) |
| POST | `/auto-no-show` | ❌ (cron) | Mark overdue bookings as no-show |

---

### 🔔 Notifications — `/api/notifications`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✅ User | Get all notifications for current user |
| PUT | `/read-all` | ✅ User | Mark all notifications as read |
| PUT | `/:id/read` | ✅ User | Mark a single notification as read |

---

### 👤 Users — `/api/users`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/me` | ✅ User | Get current user profile and balance |
| POST | `/topup` | ✅ User | Add coins to wallet |
| PUT | `/me/password` | ✅ User | Change password |
| DELETE | `/me` | ✅ User | Delete account (requires password confirmation) |

---

### 🛠️ Admin — `/api/admin`

All admin routes require both `authMiddleware` and `adminMiddleware`.

**Courts**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/courts` | Get all courts (including inactive) |
| POST | `/courts` | Add a new court |
| PUT | `/courts/:id` | Update court details or status |

**Maintenance**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/courts/:id/maintenance` | Schedule maintenance (auto-cancels & refunds affected bookings) |
| GET | `/maintenance` | Get all scheduled maintenance |
| DELETE | `/maintenance/:id` | Cancel a maintenance schedule |

**Bookings**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookings` | Get all bookings with user and court info |
| GET | `/bookings/pending` | Get pending/booked bookings only |
| POST | `/bookings/:id/confirm` | Confirm a booking via QR scan |
| DELETE | `/bookings/:id` | Force cancel a booking and refund user |

**Penalties**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/penalties` | Get all users with active penalties |
| POST | `/penalties/:id/resolve` | Clear a user's penalty |

**Statistics**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats/dashboard` | Revenue, active bookings, courts, cancellation rate |
| GET | `/stats/high-demand` | Most booked courts |
| GET | `/stats/peak-hours` | Booking volume by hour of day |
| GET | `/stats/cancellation-rate` | Overall cancellation percentage |
| GET | `/stats/revenue` | Daily revenue trend (last 30 days) |

---

## Database Schema

### `users`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| name | VARCHAR | Display name |
| email | VARCHAR | Unique login email |
| password_hash | VARCHAR | bcrypt hash |
| role | ENUM | `user` or `admin` |
| coin_balance | INT | Virtual wallet balance |
| penalty | INT | Pending penalty coins added to next booking |

### `courts`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| name | VARCHAR | Court display name |
| type | ENUM | `tennis`, `basketball`, `football`, `futsal` |
| price_per_hour | INT | Cost in coins per hour |
| is_active | BOOLEAN | Whether the court is bookable |

### `bookings`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| user_id | INT FK | References `users.id` |
| court_id | INT FK | References `courts.id` |
| date | DATE | Booking date |
| start_time | TIME | Start time |
| end_time | TIME | End time |
| status | ENUM | `booked`, `confirmed`, `completed`, `cancelled`, `no_show` |
| total_price | INT | Total coins charged |
| checked_in | BOOLEAN | Whether user has checked in |
| qr_code | VARCHAR | QR code string for check-in |

### `court_maintenance`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| court_id | INT FK | References `courts.id` |
| start_date | DATE | Maintenance start |
| end_date | DATE | Maintenance end |
| reason | VARCHAR | Description of maintenance |

### `notifications`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| user_id | INT FK | References `users.id` |
| title | VARCHAR | Notification title |
| message | TEXT | Full notification message |
| is_read | BOOLEAN | Read status |
| created_at | DATETIME | Timestamp |

### `slot_locks`
| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto-increment |
| court_id | INT FK | References `courts.id` |
| date | DATE | Lock date |
| start_time | TIME | Lock start |
| end_time | TIME | Lock end |
| expires_at | DATETIME | Auto-expires after 10 minutes |

---

## User Roles

### Regular User (`role: "user"`)
- Redirected to `user/dashboard.html` after login
- Can only access and modify their own data
- Protected by `authMiddleware` on all routes

### Admin (`role: "admin"`)
- Redirected to `admin/dashboard.html` after login
- Has access to all `/api/admin/*` endpoints
- Protected by both `authMiddleware` and `adminMiddleware`

---

## Business Logic

### Booking Flow
1. User selects court, date, start time, and end time
2. Frontend calls `/availability` — checks for booking conflicts AND maintenance periods
3. Frontend calls `/lock` — reserves the slot for 10 minutes to prevent race conditions
4. User confirms → `/book` is called: coins are deducted, penalty is cleared, booking is created with status `booked`
5. Admin scans QR code → booking status changes to `confirmed`, `checked_in = true`
6. After the session, checkout is called → status changes to `completed`

### Penalty System

| Event | Penalty |
|-------|---------|
| No-show (not checked in within 15 min of start) | +100 coins added to next booking cost |
| Late checkout (>15 min past end time) | +50 coins added to next booking cost |

Penalties are cleared automatically when a new booking is paid.

### Maintenance Scheduling
When an admin schedules maintenance for a court:
1. The maintenance record is inserted into `court_maintenance`
2. All `booked` bookings on the court within the maintenance date range are automatically cancelled
3. Full coin refunds are issued to each affected user
4. Each affected user receives a notification

---

## License

This project is for educational and demonstration purposes.

---

> Made with ❤️ — SportCourt © 2026
