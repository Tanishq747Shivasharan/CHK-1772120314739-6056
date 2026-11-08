# Extra-to-Essential

A real-time surplus food redistribution platform that connects donors with
verified NGOs through an intelligent geolocation-based matching system. The
platform routes surplus food from where it is wasted to where it is needed,
with volunteer-coordinated pickup and delivery, live status tracking, impact
metrics, and carbon credit accounting.

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-lightgrey.svg)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-black.svg)](https://socket.io/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-emerald.svg)](https://supabase.com/)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concept](#core-concept)
3. [Platform Roles](#platform-roles)
4. [System Workflow](#system-workflow)
5. [Features](#features)
6. [Technology Stack](#technology-stack)
7. [Prerequisites](#prerequisites)
8. [Installation](#installation)
9. [Environment Variables](#environment-variables)
10. [Running the Project](#running-the-project)
11. [Project Structure](#project-structure)
12. [API Reference](#api-reference)
13. [Multi-language Support](#multi-language-support)
14. [Available Scripts](#available-scripts)
15. [Contributing](#contributing)
16. [License](#license)
17. [Developers](#developers)
18. [Acknowledgments](#acknowledgments)
19. [Project Status](#project-status)

---

## Introduction

Extra-to-Essential is a full-stack web application built to reduce food waste
by streamlining the flow of surplus food from donors to NGOs and the
communities they serve. The platform provides real-time donation listing,
proximity-based donor-to-NGO matching, volunteer coordination for pickup and
delivery, live notifications, role-based dashboards, and an impact analytics
layer that quantifies meals saved and carbon-equivalent emissions avoided.

The system is designed around four roles (Donor, NGO, Volunteer, and Admin),
each with a scoped dashboard and a clear set of responsibilities. Authentication
is handled by Supabase Auth, with role and verification state enforced server-side.

---

## Core Concept

Surplus resources should not be wasted when they can help someone in need.

The platform removes the logistical disconnect between donors and NGOs by
providing:

- Real-time donation listing and tracking
- Geolocation-based matching of donors with nearby verified NGOs
- Volunteer coordination for pickup and delivery
- Live status updates and notifications
- Impact metrics and carbon credit tracking

---

## Platform Roles

### Donor

Individuals or organizations with surplus food. Donors create listings with
item details, quantity, and pickup location, then track the donation through
to delivery and view their accumulated impact.

### NGO

Verified organizations that receive and redistribute donations. NGOs browse
nearby available listings, accept listings, assign volunteers for pickup, and
confirm successful deliveries.

### Volunteer

Individuals who facilitate the physical transfer of donations. Volunteers
receive pickup assignments, verify a donor-issued collection code, transport
items to the NGO, and update delivery status.

### Admin

Platform administrators who maintain system integrity. Admins verify NGO and
donor registrations, monitor platform activity, and access system analytics.

---

## System Workflow

```
1. Donor creates listing
2. Nearby NGOs are notified
3. NGO accepts the listing
4. Volunteer is assigned (or self-accepts)
5. Volunteer verifies the donor collection code and picks up items
6. Volunteer delivers items to the NGO and confirms completion
7. Impact metrics and carbon credits are updated
```

State transitions are enforced server-side: a delivery moves from `assigned`
to `in_transit` to `delivered` (or `failed`), with each transition validated
against the previous state.

---

## Features

### Core

- **Real-time tracking** of donation status over Socket.IO
- **Geolocation matching** between donors and nearby verified NGOs
- **NGO verification** gated behind admin approval
- **Live notifications** for all stakeholders
- **Role-based dashboards** for donor, NGO, volunteer, and admin

### Advanced

- **Multi-language support** via i18next (English, Hindi, Kannada, Marathi, Telugu)
- **Carbon credit tracking** and environmental impact visualization
- **Impact metrics** including meals saved and CO2 equivalent
- **Interactive maps** powered by Leaflet
- **Secure authentication** with server-side role enforcement
- **Transactional email** via Nodemailer
- **Donor collection code (OTP)** verification for pickup handover

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| Vite | 7 | Build tool and dev server |
| React Router | 7 | Client-side routing |
| GSAP | 3 | Timeline animations |
| Framer Motion | 12 | Declarative UI animations |
| Leaflet | 1.9 | Interactive maps |
| React-Leaflet | 5 | React bindings for Leaflet |
| Socket.IO Client | 4 | Real-time communication |
| Supabase JS | 2 | Database and auth client |
| i18next | 23 | Internationalization |
| Lucide React | 0.564 | Icon set |
| Lenis | 1.3 | Smooth scrolling |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| Express | 5 | Web framework / HTTP API |
| Socket.IO | 4 | Real-time WebSocket engine |
| Supabase JS | 2 | Postgres database and auth (admin client) |
| Firebase Admin | 13 | Push notifications only |
| Nodemailer | 8 | Outbound email |
| CORS | 2.8 | Cross-origin support |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Supabase | Postgres database, Row Level Security, Auth, and Storage |
| Firebase Cloud Messaging | Push notifications |
| Nominatim (OpenStreetMap) | Geocoding and reverse geocoding |

---

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js** 18 or newer (Node 20 LTS recommended). Download it from
  [nodejs.org](https://nodejs.org/).
- **npm** (bundled with Node.js) or **yarn**.
- A **Supabase** project with the project URL, anon key, and service role key.
  Create one at [supabase.com](https://supabase.com/).
- A **Firebase** service account (for push notifications) from the
  [Firebase Console](https://console.firebase.google.com/).
- A **Gmail** account with an App Password (or any SMTP provider) for
  outbound email.

---

## Installation

This repository contains two applications: a backend API (`E-to-E_backend`)
and a frontend client (`e-to-e_frontend`). Each is a Node.js project and is
installed with `npm install`, which reads its `package.json`. A
`requirements.txt` file is also included in each folder as a human-readable
dependency manifest for reference.

> Note: This is a Node.js project. Unlike Python projects, Node.js does not
> read `requirements.txt` during installation; npm installs from `package.json`.
> The `requirements.txt` files here are provided only as a readable bill of
> materials.

### 1. Clone the repository

```bash
git clone https://github.com/Yash-Javnjal/Extra-To-Essential.git
cd Extra-To-Essential
```

### 2. Backend setup

```bash
cd E-to-E_backend
npm install
```

Create a `.env` file in `E-to-E_backend/` (see [Environment Variables](#environment-variables)).
You will need your Supabase project URL, anon key, service role key, and
Firebase service-account credentials. See `E-to-E_backend/.env.example` if
present, otherwise model it on the variables listed below.

### 3. Frontend setup

```bash
cd ../e-to-e_frontend
npm install
```

Create a `.env` file in `e-to-e_frontend/` (see
[Environment Variables](#environment-variables)).

### 4. Apply the database schema

Apply the SQL files in `E-to-E_backend/migrations/` to your Supabase project,
in numeric order. These create the tables, triggers, Postgres functions, and
Row Level Security policies the API depends on.

---

## Environment Variables

Never commit real secrets. Both `.env` files are gitignored. Use placeholder
values when sharing configuration, and provide real values only in your local
environment.

### Backend (`E-to-E_backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Port the API server listens on (e.g. `5000`) |
| `NODE_ENV` | `development` or `production` |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only; bypasses RLS) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service-account client email |
| `FIREBASE_PRIVATE_KEY` | Firebase service-account private key (PEM) |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password or app password |
| `EMAIL_FROM` | Sender display name and address |
| `OTP_HASH_SECRET` | Secret used to hash delivery collection codes |
| `FRONTEND_URL` | Frontend base URL used in email links |

Example:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM="Smart Surplus Food System <your_email@gmail.com>"
OTP_HASH_SECRET=your_long_random_secret
FRONTEND_URL=http://localhost:5173
```

### Frontend (`e-to-e_frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_API_URL` | Backend API base URL (e.g. `http://localhost:5000/api`) |

Example:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=http://localhost:5000/api
```

---

## Running the Project

Start the backend first, then the frontend.

### Backend

From `E-to-E_backend/`:

```bash
npm run dev      # development (auto-restart with nodemon)
# or
npm start        # production (plain node)
```

The API will be available at `http://localhost:5000`. A health check is at
`GET /health`.

### Frontend

From `e-to-e_frontend/`:

```bash
npm run dev
```

The development server runs at `http://localhost:5173` by default and proxies
requests to the backend using `VITE_API_URL`.

---

## Project Structure

```
Extra-To-Essential/
├── E-to-E_backend/
│   ├── config/              # Supabase and Firebase Admin configuration
│   ├── middleware/          # Authentication, role guards, rate limiting
│   ├── migrations/          # SQL schema, triggers, functions, and RLS policies
│   ├── routes/              # API route handlers
│   │   ├── admin.js         # Admin operations
│   │   ├── auth.js          # Authentication and sessions
│   │   ├── claims.js        # Donation claims
│   │   ├── deliveries.js    # Delivery tracking and OTP verification
│   │   ├── donors.js        # Donor management
│   │   ├── geocode.js       # Forward and reverse geocoding proxy
│   │   ├── impact.js        # Impact analytics
│   │   ├── listings.js      # Donation listings
│   │   └── ngos.js          # NGO and volunteer management
│   ├── services/            # Business logic (email, geocoding, impact, tracking)
│   ├── templates/           # HTML email templates
│   ├── utils/               # Mailer transport
│   ├── requirements.txt     # Backend dependency manifest (reference)
│   └── server.js            # Application entry point
│
└── e-to-e_frontend/
    ├── public/
    │   └── locales/         # i18n translation files
    ├── src/
    │   ├── admin/             # Admin dashboard views
    │   ├── components/        # Shared UI (Navbar, Hero, Footer, auth, CarbonWallet, LanguageSwitcher)
    │   ├── context/          # React context providers
    │   ├── i18n/             # Internationalization configuration
    │   ├── lib/              # Client API and Supabase helpers
    │   ├── modules/          # Feature modules (NGODashboard)
    │   ├── pages/            # Route pages (Auth, Contact, Landing, Stories)
    │   ├── sections/         # Landing page sections
    │   ├── styles/           # Global styles
    │   ├── DonorDashboard/   # Donor dashboard views
    │   ├── VolunteerDashboard/ # Volunteer dashboard views
    │   ├── App.jsx           # Root component and routes
    │   └── main.jsx          # React entry point
    ├── requirements.txt     # Frontend dependency manifest (reference)
    └── index.html            # HTML shell
```

---

## API Reference

All protected endpoints require a Bearer access token in the `Authorization`
header, issued by Supabase Auth on login or registration. Roles and
verification state are enforced server-side.

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register a donor, NGO, or volunteer | Public |
| POST | `/api/auth/login` | Email and password login | Public |
| POST | `/api/auth/oauth/profile` | Create a profile after Google sign-in | Bearer |
| POST | `/api/auth/logout` | Revoke the current session | Bearer |
| POST | `/api/auth/refresh` | Refresh an expired access token | Public |
| GET | `/api/auth/me` | Get the authenticated user's profile | Bearer |

### Listings

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/listings` | List available listings | Authenticated |
| GET | `/api/listings/my` | List the donor's own listings | Donor |
| GET | `/api/listings/search` | Search open listings by food type | Authenticated |
| GET | `/api/listings/:listing_id` | Get a single listing | Authenticated |
| POST | `/api/listings` | Create a listing | Donor |
| PUT | `/api/listings/:listing_id` | Update a listing (owner only) | Donor |
| DELETE | `/api/listings/:listing_id` | Delete an unclaimed listing (owner only) | Donor |

### Claims and Deliveries

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/api/claims` | Claim a listing and open a delivery | NGO |
| GET | `/api/claims/my` | List the NGO's claims | NGO |
| GET | `/api/claims/:claim_id` | Get a claim (owner, donor, or assigned volunteer) | Authenticated |
| PUT | `/api/claims/:claim_id` | Update claim scheduling notes | NGO |
| DELETE | `/api/claims/:claim_id` | Withdraw a claim | NGO |
| GET | `/api/deliveries/my` | List deliveries for the caller's role | Authenticated |
| GET | `/api/deliveries/:delivery_id` | Get a delivery (participant or admin) | Authenticated |
| PUT | `/api/deliveries/:delivery_id/status` | Transition delivery status | NGO |
| PUT | `/api/deliveries/:delivery_id/assign` | Assign a no-login volunteer | NGO |
| POST | `/api/deliveries/:delivery_id/accept` | Volunteer self-accepts a pickup | Volunteer |
| POST | `/api/deliveries/:delivery_id/verify-otp` | Verify the donor collection code | Volunteer |
| POST | `/api/deliveries/:delivery_id/location` | Update live volunteer location | Volunteer |
| POST | `/api/deliveries/:delivery_id/cancel` | Release an accepted pickup | Volunteer |
| POST | `/api/deliveries/:delivery_id/resend-code` | Re-issue the donor collection code | Donor |

### Donors, NGOs, and Volunteers

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/donors/me` | Get the donor's profile | Donor |
| PUT | `/api/donors/me` | Update the donor's profile | Donor |
| GET | `/api/donors/:donor_id` | Get a donor (limited fields) | NGO, Admin |
| PUT | `/api/donors/:donor_id/verify` | Verify a donor | Admin |
| GET | `/api/ngos` | List NGOs | Authenticated |
| GET | `/api/ngos/me` | Get the NGO's profile | NGO |
| PUT | `/api/ngos/me` | Update the NGO's profile | NGO |
| GET | `/api/ngos/:ngo_id` | Get an NGO | Authenticated |
| PUT | `/api/ngos/:ngo_id/verify` | Verify an NGO | Admin |
| POST | `/api/ngos/me/volunteers` | Add a volunteer record | NGO |
| GET | `/api/ngos/me/volunteers` | List the NGO's volunteers | NGO |
| PUT | `/api/ngos/me/volunteers/:volunteer_id` | Update a volunteer record | NGO |
| DELETE | `/api/ngos/me/volunteers/:volunteer_id` | Remove a volunteer record | NGO |

### Impact, Geocoding, and Admin

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/impact/total` | Platform-wide impact totals | Public |
| GET | `/api/impact/leaderboard/donors` | Donor impact leaderboard | Public |
| GET | `/api/impact/performance/ngos` | NGO performance ranking | Public |
| GET | `/api/impact/summary` | The caller's impact and credits | Authenticated |
| GET | `/api/impact/performance/volunteers` | Volunteer performance | Admin |
| GET | `/api/geocode/reverse` | Reverse geocode coordinates | Public |
| GET | `/api/geocode/search` | Forward geocode an address | Public |
| GET | `/api/admin/impact-overview` | Platform impact overview | Admin |

---

## Multi-language Support

The interface supports five languages. Translation files live in
`e-to-e_frontend/public/locales/` and are loaded by i18next with automatic
browser-language detection.

- English (`en`)
- Hindi (`hi`)
- Kannada (`kn`)
- Marathi (`mr`)
- Telugu (`te`)

---

## Available Scripts

### Frontend (`e-to-e_frontend/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

### Backend (`E-to-E_backend/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the server with nodemon (auto-restart) |
| `npm start` | Start the server with node |

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes with a clear message.
4. Push the branch (`git push origin feature/your-feature`).
5. Open a pull request describing the change and what was tested.

When adding new dependencies, prefer pinned versions and run `npm audit` before
submitting. Do not commit `.env` files or real credentials.

---

## License

This project is open source and available for educational and non-commercial
use. See the `LICENSE` file for details.

---

## Developers

- **Yash Javnjal** — [GitHub](https://github.com/Yash-Javnjal)
- **Tanishq Shivasharan**

---

## Acknowledgments

- [Supabase](https://supabase.com/) for the database, auth, and storage layer.
- [Firebase](https://firebase.google.com/) for push notifications.
- [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/) for maps and geocoding.
- [Socket.IO](https://socket.io/) for real-time communication.
- All contributors and supporters of the project.

---

## Project Status

Active development. The platform is under ongoing improvement; expect regular
updates.

---

*Extra-to-Essential — transforming surplus into support, one donation at a time.*
