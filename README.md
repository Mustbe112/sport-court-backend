# SportCourt — Sports Court Booking System

A full-stack web application for booking sports courts with real-time availability, coin-based payments, QR code check-ins, and an admin management panel.

 **Frontend:** https://tourmaline-tulumba-4614bf.netlify.app/
 **Backend API:** https://sport-court-backend.onrender.com

> **Note:** The backend is hosted on Render's free tier and may take 20–30 seconds to wake up on the first request.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [User Roles](#user-roles)
- [Business Logic](#business-logic)

---

## Overview

SportCourt is a full-stack court booking platform. Users can browse sports courts (tennis, basketball, football, futsal), book sessions using a virtual coin wallet, receive QR codes for check-in, and manage their booking history. Admins have a dedicated panel with analytics, court management, maintenance scheduling, and a QR scanner for check-ins.

```
[Browser]
   │
   ▼
[Frontend — Netlify]
https://tourmaline-tulumba-4614bf.netlify.app/
   │
   │  REST API calls
   ▼
[Backend — Render]
https://sport-court-backend.onrender.com/api
   │
   ▼
[MySQL Database — Cloud]
```

---

## Features

### User
- Register and login with JWT authentication
- Browse and filter courts by sport type, name, and price
- Real-time availability checking before booking
- 10-minute slot locking to prevent double-booking
- Coin wallet with top-up support
- QR code generated per booking for check-in
- Notifications for confirmations, cancellations, and penalties
- Favorite courts for quick re-booking
- Downloadable PDF receipts
- Profile management and account deletion

### Admin
- Dashboard with revenue, peak hours, and court demand charts
- Add, edit, and activate/deactivate courts
- Schedule court maintenance — automatically cancels and refunds affected bookings
- View and force-cancel any booking with automatic refund
- QR scanner for user check-in validation
- View and resolve user penalties
- Revenue and booking analytics

### Automated
- Cron job marks bookings as `no_show` if user doesn't check in within 15 minutes of start time
- No-show penalty: 100 coins, no refund
- Late checkout penalty: 50 coins on next booking

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| HTML / CSS / Vanilla JS | UI and interactivity |
| Chart.js | Admin analytics charts |
| Google Fonts (Barlow) | Typography |

### Backend
| Technology | Purpose |
|-----------|---------|
| Node.js + Express | REST API server |
| mysql2/promise | MySQL database with connection pooling |
| bcrypt | Password hashing |
| jsonwebtoken | JWT authentication |
| qrcode | QR code generation |
| jsPDF | PDF receipt generation |
| dotenv | Environment variables |
| cors | Cross-origin requests |
| node-cron | Scheduled no-show detection |

### Hosting
| Service | Role |
|---------|------|
| Netlify | Frontend (static files) |
| Render | Backend API (Node.js) |
| MySQL Cloud | Database (SSL connection) |

---

## Project Structure

```
sportcourt/
│
├── server.js                        # Entry point
│
├── src/
│   ├── app.js                       # Express setup, CORS, route mounting
│   ├── config/
│   │   └── db.js                    # MySQL connection pool
│   ├── controllers/
│   │   ├── adminController.js       # Courts, maintenance, bookings, stats
│   │   ├── authController.js        # Register & login
│   │   ├── bookingController.js     # Book, cancel, check-in, check-out
│   │   └── notificationController.js
│   ├── middlewares/
│   │   ├── authMiddleware.js        # JWT verification
│   │   └── adminMiddleware.js       # Admin role check
│   ├── routes/
│   │   ├── adminRoutes.js           # /api/admin/*
│   │   ├── authRoutes.js            # /api/auth/*
│   │   ├── bookingRoutes.js         # /api/bookings/*
│   │   ├── courtRoutes.js           # /api/courts/*
│   │   ├── notificationRoutes.js    # /api/notifications/*
│   │   └── userRoutes.js            # /api/users/*
│   ├── utils/
│   │   ├── bookingUtils.js          # QR code & PDF generation
│   │   └── notificationUtils.js     # createNotification() helper
│   └── cron/
│       └── noShowJob.js             # Auto no-show scheduled job
│
└── frontend/
    ├── index.html                   # Login page
    ├── register.html
    ├── css/
    │   ├── style.css
    │   └── alerts.css
    ├── js/
    │   ├── api.js                   # apiFetch() helper, API base URL
    │   ├── auth.js                  # login(), logout(), checkAuth()
    │   ├── notifications.js         # Notification polling & display
    │   └── topup.js                 # Coin top-up modal
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

## Getting Started

### Prerequisites
- Node.js v18+
- npm
- MySQL database

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/sportcourt.git
   cd sportcourt
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory (see [Environment Variables](#environment-variables)).

4. Start the server:
   ```bash
   node server.js
   # or with auto-reload:
   npx nodemon server.js
   ```

5. Serve the frontend:
   ```bash
   npx serve frontend/
   ```

6. To use your local backend instead of the live API, update `frontend/js/api.js`:
   ```js
   const API_BASE = "http://localhost:4000/api";
   ```

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=4000

DB_HOST=your-database-host
DB_PORT=3306
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name

JWT_SECRET=your-secret-key
```

> Never commit `.env` to Git. Make sure it is listed in `.gitignore`.

---

## API Reference

**Base URL:** `https://sport-court-backend.onrender.com/api`

Protected routes require:
```
Authorization: Bearer <token>
```

### Auth — `/api/auth`
| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/register` | ❌ | Register a new account |
| POST | `/login` | ❌ | Login and receive a JWT token |

### Courts — `/api/courts`
| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | ❌ | Get all active courts |
| GET | `/type/:type` | ❌ | Filter courts by sport type |

### Bookings — `/api/bookings`
| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/availability` | ✅ | Check if a slot is available |
| POST | `/lock` | ✅ | Lock a slot for 10 minutes |
| POST | `/book` | ✅ | Create booking and deduct coins |
| POST | `/cancel/:id` | ✅ | Cancel booking and refund coins |
| POST | `/checkout/:id` | ✅ | Check out after session |
| GET | `/my-bookings` | ✅ | Get your booking history |
| GET | `/:id` | ✅ | Get a single booking by ID |

### Notifications — `/api/notifications`
| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | ✅ | Get your notifications |
| PUT | `/read-all` | ✅ | Mark all as read |
| PUT | `/:id/read` | ✅ | Mark one as read |

### Users — `/api/users`
| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/me` | ✅ | Get profile and coin balance |
| POST | `/topup` | ✅ | Add coins to wallet |
| PUT | `/me/password` | ✅ | Change password |
| DELETE | `/me` | ✅ | Delete account |

### Admin — `/api/admin`
> Requires `role: "admin"` in JWT token.

**Courts**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/courts` | Get all courts |
| POST | `/courts` | Add a new court |
| PUT | `/courts/:id` | Update a court |

**Maintenance**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/courts/:id/maintenance` | Schedule maintenance (auto-cancels & refunds affected bookings) |
| GET | `/maintenance` | Get all maintenance schedules |
| DELETE | `/maintenance/:id` | Cancel a maintenance schedule |

**Bookings**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookings` | Get all bookings |
| GET | `/bookings/pending` | Get pending bookings |
| POST | `/bookings/:id/confirm` | Confirm check-in via QR |
| DELETE | `/bookings/:id` | Force cancel and refund |

**Penalties**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/penalties` | Get users with penalties |
| POST | `/penalties/:id/resolve` | Clear a user's penalty |

**Statistics**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats/dashboard` | Revenue, bookings, courts summary |
| GET | `/stats/high-demand` | Most booked courts |
| GET | `/stats/peak-hours` | Bookings by hour of day |
| GET | `/stats/cancellation-rate` | Cancellation percentage |
| GET | `/stats/revenue` | Daily revenue (last 30 days) |

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| name | VARCHAR | |
| email | VARCHAR | Unique |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | `user` or `admin` |
| coin_balance | INT | Virtual wallet |
| penalty | INT | Added to next booking |

### `courts`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| name | VARCHAR | |
| type | ENUM | `tennis`, `basketball`, `football`, `futsal` |
| price_per_hour | INT | Coins per hour |
| is_active | BOOLEAN | |

### `bookings`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| user_id | INT FK | → `users.id` |
| court_id | INT FK | → `courts.id` |
| date | DATE | |
| start_time | TIME | |
| end_time | TIME | |
| status | ENUM | `booked` → `confirmed` → `completed` / `cancelled` / `no_show` |
| total_price | INT | Coins charged |
| checked_in | BOOLEAN | |
| qr_code | VARCHAR | For check-in scanning |

### `court_maintenance`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| court_id | INT FK | → `courts.id` |
| start_date | DATE | |
| end_date | DATE | |
| reason | VARCHAR | |

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| user_id | INT FK | → `users.id` |
| title | VARCHAR | |
| message | TEXT | |
| is_read | BOOLEAN | Default `0` |
| created_at | DATETIME | |

### `slot_locks`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| court_id | INT FK | → `courts.id` |
| date | DATE | |
| start_time | TIME | |
| end_time | TIME | |
| expires_at | DATETIME | Auto-expires after 10 minutes |

---

## User Roles

### User (`role: "user"`)
- Redirected to `user/dashboard.html` on login
- Can only access their own bookings, notifications, and profile
- Protected by `authMiddleware`

### Admin (`role: "admin"`)
- Redirected to `admin/dashboard.html` on login
- Full access to all `/api/admin/*` endpoints
- Protected by `authMiddleware` + `adminMiddleware`

---

## Business Logic

### Penalty System
| Event | Penalty |
|-------|---------|
| No-show (not checked in within 15 min of start) | +100 coins on next booking |
| Late checkout (>15 min past end time) | +50 coins on next booking |

Penalties are deducted at the time of the next booking, then reset to zero.

### Maintenance Scheduling
When maintenance is scheduled for a court:
1. All `booked` bookings within the maintenance dates are automatically cancelled
2. Full coin refunds are issued to each affected user
3. Each affected user receives a notification

---

## License

This project is for educational purposes.

---

