# Extra-To-Essential 🌍

[![React](https://img.shields.io/badge/React-19.2.4-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.22.1-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.2.1-lightgrey.svg)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8.1-black.svg)](https://socket.io/)

## 📖 Introduction

Extra-To-Essential is a real-time resource redistribution platform that bridges the gap between surplus and need. The platform connects donors with verified NGOs through an intelligent geolocation-based matching system, ensuring that essential resources like food, clothing, and other necessities reach those who need them most.

Built with modern web technologies, the platform provides real-time tracking, live notifications, multi-language support, and role-based dashboards to create an efficient ecosystem for resource redistribution.

---

## 💡 Core Concept

**Surplus resources should not be wasted when they can help someone in need.**

Extra-To-Essential eliminates the logistical disconnect between donors and NGOs by providing:
- Real-time donation listing and tracking
- Geolocation-based matching of donors with nearby NGOs
- Volunteer coordination for pickup and delivery
- Live status updates and notifications
- Impact metrics and carbon credit tracking

---

## Platform Roles

The system operates through four primary roles.

### Donor
The donor provides surplus items such as food or clothing.  
Responsibilities:
- Create donation listings  
- Provide location details  
- Monitor donation status  
- Track delivery progress  

---

### NGO
NGOs act as receivers and coordinators of donations.  
Responsibilities:
- View nearby donations  
- Accept listings  
- Assign volunteers  
- Confirm successful delivery  

---

### Volunteer
Volunteers handle the physical movement of donations.  
Responsibilities:
- Receive assigned pickups  
- Navigate to donor location  
- Deliver items to NGO  
- Update delivery status  

---

### Admin
Administrators maintain system integrity.  
Responsibilities:
- Verify NGOs  
- Monitor activity  
- Resolve issues  
- Manage platform data  

---

## System Workflow

1. Donor creates a listing.
2. Nearby NGOs receive notification.
3. NGO accepts listing.
4. Volunteer is assigned.
5. Volunteer picks up donation.
6. Delivery is completed.
7. Status updates in real time.

---

## Features

- Real-time donation tracking  
- Geolocation-based matching  
- Verified NGO system  
- Live notifications  
- Role-based dashboards  
- Impact monitoring metrics  
- Secure authentication  
- Scalable architecture  

---

## 👥 Platform Roles

### 🎁 Donor
Individuals or organizations with surplus resources.

**Capabilities:**
- Create and manage donation listings
- Provide item details and location
- Track donation status in real-time
- View delivery progress and confirmation
- Access impact metrics and carbon credits

### 🏢 NGO (Non-Governmental Organization)
Verified organizations that receive and distribute donations.

**Capabilities:**
- Browse nearby available donations
- Accept listings based on needs
- Assign volunteers for pickup
- Confirm successful deliveries
- Track impact and distribution metrics

### 🚚 Volunteer
Individuals who facilitate the physical transfer of donations.

**Capabilities:**
- Receive pickup assignments
- Navigate to donor locations
- Transport items to NGOs
- Update delivery status
- Track contribution history

### 🛡️ Admin
Platform administrators who ensure system integrity.

**Capabilities:**
- Verify and approve NGO registrations
- Monitor platform activity
- Manage user accounts
- Resolve disputes and issues
- Access system logs and analytics

---

## 🔄 System Workflow

```
1. 📝 Donor creates listing → 2. 🔔 NGOs notified → 3. ✅ NGO accepts
                                                              ↓
7. 📊 Impact tracked ← 6. ✓ Delivery confirmed ← 5. 🚚 Volunteer delivers ← 4. 👤 Volunteer assigned
```

**Detailed Flow:**
1. Donor creates a donation listing with item details and location
2. System notifies nearby verified NGOs via real-time notifications
3. NGO reviews and accepts the listing
4. NGO assigns an available volunteer for pickup
5. Volunteer picks up items from donor location
6. Volunteer delivers items to NGO and confirms completion
7. System updates impact metrics and carbon credits

---

## ✨ Key Features

### Core Functionality
- 🔴 **Real-time Tracking** - Live donation status updates via Socket.IO
- 📍 **Geolocation Matching** - Intelligent proximity-based donor-NGO pairing
- ✓ **NGO Verification** - Admin-approved organization system
- 🔔 **Live Notifications** - Instant updates for all stakeholders
- 📊 **Role-based Dashboards** - Customized interfaces for each user type

### Advanced Features
- 🌍 **Multi-language Support** - i18n integration (English, Hindi, Kannada, Marathi, Telugu)
- 🌱 **Carbon Credit Tracking** - Environmental impact visualization
- 📈 **Impact Metrics** - Real-time donation and delivery statistics
- 🗺️ **Interactive Maps** - Leaflet-powered location visualization
- 🔐 **Secure Authentication** - Firebase-based auth with role management
- 📧 **Email Notifications** - Automated updates via Nodemailer
- 🎨 **Smooth Animations** - GSAP and Framer Motion powered UI

---

## 🛠️ Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.4 | UI framework |
| Vite | 7.3.1 | Build tool |
| React Router | 7.13.1 | Navigation |
| GSAP | 3.14.2 | Animations |
| Framer Motion | 12.34.3 | UI animations |
| Leaflet | 1.9.4 | Maps |
| Socket.IO Client | 4.8.3 | Real-time communication |
| Supabase | 2.97.0 | Database client |
| i18next | 23.16.8 | Internationalization |
| Lucide React | 0.564.0 | Icons |
| Lenis | 1.3.17 | Smooth scrolling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22.22.1 | Runtime |
| Express | 5.2.1 | Web framework |
| Socket.IO | 4.8.1 | Real-time engine |
| Firebase Admin | 13.7.0 | Authentication |
| Supabase | 2.99.0 | Database |
| Nodemailer | 8.0.2 | Email service |
| CORS | 2.8.6 | Cross-origin support |

---

## 📦 Installation

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Firebase project setup
- Supabase project setup

### 1. Clone Repository
```bash
git clone https://github.com/Yash-Javnjal/Extra-To-Essential.git
cd Extra-To-Essential
```

### 2. Backend Setup
```bash
cd E-to-E_backend
npm install
```

Create `.env` file in `E-to-E_backend/`:
```env
PORT=5000
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
```

Start backend server:
```bash
npm start
```

### 3. Frontend Setup
```bash
cd ../e-to-e_frontend
npm install
```

Create `.env` file in `e-to-e_frontend/`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_BACKEND_URL=http://localhost:5000
```

Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

---

## 🗂️ Project Structure

```
Extra-To-Essential/
├── E-to-E_backend/
│   ├── config/              # Firebase & Supabase configuration
│   ├── middleware/          # Auth & role guard middleware
│   ├── routes/              # API endpoints
│   │   ├── admin.js         # Admin operations
│   │   ├── auth.js          # Authentication
│   │   ├── claims.js        # Donation claims
│   │   ├── deliveries.js    # Delivery tracking
│   │   ├── donors.js        # Donor management
│   │   ├── geocode.js       # Location services
│   │   ├── impact.js        # Impact metrics
│   │   ├── listings.js      # Donation listings
│   │   └── ngos.js          # NGO management
│   ├── services/            # Business logic
│   ├── templates/           # Email templates
│   ├── utils/               # Helper functions
│   └── server.js            # Entry point
│
└── e-to-e_frontend/
    ├── public/
    │   └── locales/         # i18n translation files
    └── src/
        ├── admin/           # Admin dashboard components
        ├── components/      # Reusable UI components
        │   ├── auth/        # Authentication components
        │   ├── CarbonWallet/# Carbon credit tracking
        │   └── LanguageSwitcher/
        ├── donor/           # Donor dashboard
        ├── ngo/             # NGO dashboard
        ├── volunteer/       # Volunteer dashboard
        └── App.jsx          # Root component
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification

### Listings
- `GET /api/listings` - Get all listings
- `POST /api/listings` - Create new listing
- `GET /api/listings/:id` - Get listing details
- `PUT /api/listings/:id` - Update listing
- `DELETE /api/listings/:id` - Delete listing

### Claims & Deliveries
- `POST /api/claims` - Claim a listing
- `GET /api/deliveries` - Get deliveries
- `PUT /api/deliveries/:id` - Update delivery status

### Admin
- `GET /api/admin/ngos/pending` - Get pending NGO verifications
- `PUT /api/admin/ngos/:id/verify` - Verify NGO
- `GET /api/admin/stats` - Get platform statistics

---

## 🌐 Multi-language Support

Supported languages:
- 🇬🇧 English (en)
- 🇮🇳 Hindi (hi)
- 🇮🇳 Kannada (kn)
- 🇮🇳 Marathi (mr)
- 🇮🇳 Telugu (te)

Translation files located in `e-to-e_frontend/public/locales/`


---

## 🚀 Development Scripts

### Frontend
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Backend
```bash
npm start        # Start server with nodemon
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is open source and available for educational and non-commercial use.

---

## 👨‍💻 Developers

- **Yash Javanjal** - [GitHub](https://github.com/Yash-Javnjal)
- **Tanishq Shivsharan**

---

## 📧 Contact

For questions, suggestions, or support, please open an issue on GitHub.

---

## 🙏 Acknowledgments

- Firebase for authentication services
- Supabase for database infrastructure
- Leaflet for mapping capabilities
- Socket.IO for real-time communication
- All contributors and supporters of the project

---

## 📊 Project Status

🟢 **Active Development** - The platform is under active development with regular updates and improvements.

---

**Extra-To-Essential** - *Transforming surplus into support, one donation at a time.* 🌍💚
