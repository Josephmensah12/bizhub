# BIZHUB - Business Hub for Payless4Tech

A comprehensive web application for managing refurbished electronics retail business operations in Ghana. Built specifically for Payless4Tech's unique workflow: refurbished laptop inventory, grading, diagnostics, warranties, preorders, BNPL, repairs, and Ghana-focused retail/wholesale operations.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Default Credentials](#default-credentials)
- [Documentation](#documentation)
- [Development Workflow](#development-workflow)
- [API Testing](#api-testing)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## ✨ Features

### Core Modules

- **Dashboard**: Real-time business metrics, sales tracking, inventory status, work queues
- **Inventory Management**:
  - Serialized asset tracking (each laptop/phone is unique)
  - Bulk stock management (accessories, chargers, etc.)
  - Complete workflow: Receive → Diagnostics → Data Wipe → QC → Ready for Sale
  - Location tracking, condition grading (A/B/C), battery health
- **Sales & Invoicing**:
  - Create invoices with multiple line items
  - Split-tender payment support (Cash, MoMo, Bank Transfer, Card)
  - Retail vs Wholesale sales channels
  - Lead source tracking (Instagram, Walk-in, Referral, etc.)
  - Profit margin calculation
- **Preorder Management**:
  - Customer deposits (GHC 500 default)
  - SLA tracking (21-day lead time)
  - Rejection handling with resale recovery
  - Deposit refund workflow
- **Warranty System**:
  - Standard and Premium 1-Year warranty tiers
  - Warranty claim management
  - Certificate generation (placeholder)
- **Repair Tickets**:
  - Issue tracking and status workflow
  - Parts and labor cost tracking
  - Technician assignment
- **Reporting**:
  - Sales reports by period, channel, customer type
  - Inventory aging analysis
  - Low stock alerts
  - Preorder SLA breach reports

### Technical Features

- **API-First Architecture**: Clean REST API with comprehensive endpoints
- **Role-Based Access Control**: Admin, Manager, Sales, Technician, Warehouse roles
- **Authentication**: JWT-based secure authentication
- **Data Integrity**: Transaction support, audit trails, inventory movements
- **Responsive UI**: Mobile-friendly, modern dashboard design
- **Real-time Metrics**: Dashboard auto-refresh capabilities

---

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 14+
- **ORM**: Sequelize 6.x
- **Authentication**: JWT + bcrypt
- **Validation**: express-validator

### Frontend
- **Framework**: React 18.x
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router 6.x
- **HTTP Client**: Axios
- **Charts**: Recharts
- **Forms**: React Hook Form
- **Date Handling**: date-fns

---

## 📁 Project Structure

```
bizhub/
├── ARCHITECTURE.md          # System architecture documentation
├── DB_SCHEMA.md            # Database schema and ERD
├── API_SPEC.md             # REST API specification
├── README.md               # This file
│
├── backend/
│   ├── config/
│   │   └── database.js     # Database connection config
│   ├── controllers/
│   │   ├── authController.js
│   │   └── _README.md      # Controller implementation guide
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication
│   │   └── errorHandler.js # Global error handling
│   ├── models/
│   │   └── index.js        # Sequelize models loader
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── assetRoutes.js
│   │   └── ...             # All API routes
│   ├── migrations/         # Database migrations (to be created)
│   ├── seeders/            # Seed data (to be created)
│   ├── .env.example        # Environment variables template
│   ├── .sequelizerc        # Sequelize CLI config
│   ├── app.js              # Express app setup
│   ├── server.js           # Entry point
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── layout/
    │   │       ├── Layout.jsx
    │   │       ├── Sidebar.jsx
    │   │       └── TopBar.jsx
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Inventory.jsx
    │   │   └── ...         # All page components
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or higher ([Download](https://nodejs.org/))
- **PostgreSQL**: Version 14.x or higher ([Download](https://www.postgresql.org/download/))
- **Git**: For version control ([Download](https://git-scm.com/))
- **npm** or **yarn**: Package manager (comes with Node.js)

### Recommended Tools

- **Postman**: For API testing ([Download](https://www.postman.com/))
- **pgAdmin** or **DBeaver**: For database management
- **VS Code**: Code editor ([Download](https://code.visualstudio.com/))

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/bizhub.git
cd bizhub
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## 🗄 Database Setup

### 1. Create PostgreSQL Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE bizhub_db;
CREATE USER bizhub_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE bizhub_db TO bizhub_user;

# Exit psql
\q
```

### 2. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` file with your database credentials:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bizhub_db
DB_USER=bizhub_user
DB_PASSWORD=your_secure_password

JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRY=24h

CORS_ORIGIN=http://localhost:5173
```

### 3. Create Database Models

**IMPORTANT**: You need to create Sequelize models based on the schema defined in `DB_SCHEMA.md`.

Example model structure (`models/User.js`):

```javascript
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('Admin', 'Manager', 'Sales', 'Technician', 'Warehouse'),
      allowNull: false
    },
    full_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    phone: DataTypes.STRING(20),
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: DataTypes.DATE
  }, {
    tableName: 'users',
    underscored: true
  });

  User.associate = (models) => {
    // Define associations here
    // User.hasMany(models.Invoice, { foreignKey: 'sales_rep_id' });
  };

  return User;
};
```

Repeat for all models defined in `DB_SCHEMA.md`:
- User
- Customer
- ProductModel
- Asset
- BulkStock
- Location
- InventoryMovement
- DiagnosticsResult
- WipeCertificate
- Invoice
- InvoiceLine
- Payment
- Preorder
- PreorderEvent
- Warranty
- WarrantyClaim
- RepairTicket
- RepairEvent
- LeadSource

### 4. Create and Run Migrations

```bash
# Generate migration
npx sequelize-cli migration:generate --name create-initial-schema

# Edit the migration file in migrations/ folder
# Add CREATE TABLE statements from DB_SCHEMA.md

# Run migration
npm run migrate
```

### 5. Seed Database

Create seed files in `seeders/` directory:

```bash
npx sequelize-cli seed:generate --name seed-initial-data

# Edit seed file to add:
# - Admin user
# - Locations
# - Lead sources
# - Sample product models
# - Sample customers
# - Sample assets

# Run seeds
npm run seed
```

---

## ▶️ Running the Application

### Development Mode

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

Backend will run on `http://localhost:3000`

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

Frontend will run on `http://localhost:5173`

### Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api/v1
- **Health Check**: http://localhost:3000/health

---

## 🔐 Default Credentials

After seeding the database, use these credentials to login:

```
Username: admin
Password: changeme123
```

**IMPORTANT**: Change the default admin password immediately after first login!

---

## 📚 Documentation

Comprehensive documentation is available in the following files:

1. **[ARCHITECTURE.md](ARCHITECTURE.md)**: System architecture, module design, data flow, technology stack
2. **[DB_SCHEMA.md](DB_SCHEMA.md)**: Complete database schema, tables, relationships, indexes, triggers
3. **[API_SPEC.md](API_SPEC.md)**: REST API endpoints, request/response formats, authentication, error handling
4. **[backend/controllers/_README.md](backend/controllers/_README.md)**: Controller implementation guide

---

## 👨‍💻 Development Workflow

### Implementing a New Feature

1. **Review Documentation**: Check architecture and API spec
2. **Create Model** (if new entity needed):
   - Define Sequelize model in `backend/models/`
   - Create migration
   - Run migration
3. **Implement Controller**:
   - Create controller in `backend/controllers/`
   - Implement business logic
   - Use `asyncHandler` for error handling
4. **Define Routes**:
   - Add routes in `backend/routes/`
   - Apply authentication and authorization middleware
5. **Test API**:
   - Use Postman to test endpoints
   - Verify responses
6. **Build Frontend**:
   - Create/update React components
   - Add API service functions
   - Implement UI
7. **Test End-to-End**:
   - Test complete user workflow
   - Verify data integrity

### Code Style

- **Backend**: Follow Node.js best practices, use async/await
- **Frontend**: Use functional components with hooks
- **Naming**:
  - Database: `snake_case`
  - JavaScript: `camelCase`
  - Components: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`

---

## 🧪 API Testing

### Using Postman

1. Import the provided Postman collection (to be created)
2. Set environment variable `baseUrl` to `http://localhost:3000/api/v1`
3. Login to get JWT token
4. Token will be automatically set in subsequent requests

### Example API Calls

**Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'
```

**Get Dashboard Metrics:**
```bash
curl http://localhost:3000/api/v1/dashboard/metrics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🚢 Deployment

### Production Checklist

1. **Environment Variables**:
   - Set `NODE_ENV=production`
   - Use strong `JWT_SECRET`
   - Configure production database
   - Set appropriate `CORS_ORIGIN`

2. **Database**:
   - Run migrations on production DB
   - Setup automated backups
   - Enable SSL connections

3. **Backend**:
   - Build: `npm run build` (if using TypeScript)
   - Start: `npm start`
   - Use process manager: PM2 or systemd
   - Enable HTTPS with reverse proxy (Nginx)

4. **Frontend**:
   - Build: `npm run build`
   - Serve static files via Nginx or CDN
   - Configure environment-specific API URL

5. **Security**:
   - Change default admin password
   - Review CORS settings
   - Enable rate limiting
   - Setup firewall rules

### Deployment Platforms

- **Backend**: Heroku, AWS EC2, DigitalOcean Droplet, Railway
- **Frontend**: Vercel, Netlify, AWS S3 + CloudFront
- **Database**: AWS RDS, Heroku Postgres, DigitalOcean Managed Database

---

## 🤝 Contributing

This is a private project for Payless4Tech. For internal contributions:

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Commit changes: `git commit -m "Add your feature"`
3. Push to branch: `git push origin feature/your-feature-name`
4. Create Pull Request for review

---

## 📝 Implementation Status

### ✅ Completed
- [x] Architecture design
- [x] Database schema design
- [x] API specification
- [x] Project scaffolding
- [x] Backend structure (routes, middleware)
- [x] Frontend structure (components, pages, routing)
- [x] Authentication system (JWT)
- [x] Dashboard UI (sample)

### 🚧 In Progress / To Do
- [ ] Database models (User model done as reference)
- [ ] Database migrations
- [ ] Seed data
- [ ] Controller implementations:
  - [ ] User management
  - [ ] Product models
  - [ ] Assets (HIGH PRIORITY)
  - [ ] Bulk stock
  - [ ] Invoices (HIGH PRIORITY)
  - [ ] Customers
  - [ ] Preorders
  - [ ] Warranties
  - [ ] Repairs
  - [ ] Reports
  - [ ] Dashboard metrics
- [ ] Frontend pages:
  - [ ] Inventory management UI
  - [ ] Sales/Invoice creation UI
  - [ ] Preorder management UI
  - [ ] Customer management UI
  - [ ] Repair tickets UI
  - [ ] Reports UI
- [ ] Testing (unit + integration)
- [ ] Deployment configuration

---

## 📞 Support

For support or questions:
- **Email**: support@payless4tech.com
- **Internal Slack**: #bizhub-dev

---

## 📄 License

Proprietary - Copyright © 2024 Payless4Tech. All rights reserved.

---

## 🙏 Acknowledgments

- Built with Claude Code
- Inspired by SalesBinder layout (functionality is custom-built)
- Tailored specifically for Ghana's refurbished electronics market

---

**Last Updated**: 2026-01-14
**Version**: 1.0.0 (MVP)
**Status**: Ready for Implementation
