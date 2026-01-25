# TM Accounts Dashboard

A Next.js application for managing Ticketmaster accounts, card profiles, purchases, and event tracking with TicketVault POS integration.

## Features

- **Account Management**: Track and manage Ticketmaster accounts with status, IMAP configuration, and activity history
- **Card Profiles**: Manage payment card profiles linked to accounts with soft-delete support
- **Purchase Tracking**: View and analyze purchase history with profit calculations
- **Event Management**: Track events with pricing data from secondary markets
- **Queue Analytics**: Monitor queue positions across accounts for events
- **POS Integration**: Sync purchases to TicketVault POS for listing and fulfillment
- **Analytics**: Account rankings, success rates, and revenue statistics

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL via [Supabase](https://supabase.com)
- **ORM**: Prisma
- **UI**: Tailwind CSS + shadcn/ui components
- **Hosting**: Vercel
- **TypeScript**: Full type safety throughout

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

### 1. Clone and Install

```bash
git clone <repository-url>
cd tm-accounts
npm install
```

### 2. Setup Supabase Database

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Project Settings** → **Database** → **Connection String**
3. Select **Session Pooler** mode (for IPv4 compatibility)
4. Copy the connection string

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase connection strings:

```env
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

### 4. Initialize Database

```bash
npx prisma generate
npx prisma db push
```

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to view the application.

## Deployment (Vercel)

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

### Option B: GitHub Integration

1. Push your code to GitHub
2. Import the repository at [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Vercel

Add these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Session Pooler connection string |
| `DIRECT_URL` | Same as DATABASE_URL for session pooler |
| `TICKETVAULT_USERNAME` | (Optional) TicketVault POS username |
| `TICKETVAULT_PASSWORD` | (Optional) TicketVault POS password |

## Project Structure

```
tm-accounts/
├── prisma/
│   └── schema.prisma         # Database schema
├── scripts/
│   └── seed.ts               # Data seeding script
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API routes
│   │   │   ├── accounts/     # Account CRUD
│   │   │   ├── cards/        # Card management
│   │   │   ├── purchases/    # Purchase tracking
│   │   │   ├── events/       # Event management
│   │   │   ├── listings/     # POS listings
│   │   │   ├── sales/        # Sales tracking
│   │   │   ├── pos/          # TicketVault POS sync
│   │   │   ├── import/       # Data import endpoints
│   │   │   └── export/       # Data export endpoints
│   │   ├── accounts/         # Accounts page
│   │   ├── cards/            # Card profiles page
│   │   ├── purchases/        # Purchases page
│   │   ├── listings/         # POS listings page
│   │   ├── sales/            # Sales page
│   │   └── events/           # Events page
│   ├── components/           # React components
│   │   ├── ui/               # shadcn/ui components
│   │   └── *.tsx             # Feature components
│   └── lib/                  # Utilities and services
│       ├── analytics/        # Account scoring logic
│       ├── importers/        # CSV/data parsers
│       ├── services/         # External API integrations
│       └── utils/            # Helper functions
└── public/                   # Static assets
```

## API Reference

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts with pagination and filtering |
| GET | `/api/accounts/[id]` | Get single account with details |
| PATCH | `/api/accounts/[id]` | Update account |
| DELETE | `/api/accounts/[id]` | Delete account |

### Cards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cards` | List card profiles with filtering |
| PATCH | `/api/cards` | Bulk soft delete/restore cards |
| PATCH | `/api/cards/[id]` | Update card |
| DELETE | `/api/cards/[id]` | Soft delete card |

### Purchases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchases` | List purchases with stats |
| POST | `/api/purchases` | Create manual purchase |
| PATCH | `/api/purchases/[id]` | Update single purchase |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events |
| GET | `/api/events/[id]` | Get event details |
| POST | `/api/events/[id]/sync-prices` | Sync pricing from secondary market |

### POS Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/listings` | Get cached POS listings |
| POST | `/api/listings` | Sync listings from TicketVault |
| POST | `/api/pos/sync` | Export purchases to POS |

## Database Models

### Account
Stores Ticketmaster account credentials and status.
- Supports multiple linked cards (one-to-many)
- Tracks purchase history and queue testing results
- POS sync metadata for TicketVault integration

### Card
Payment card profiles for checkout.
- Soft delete support (deletedAt field)
- Links to accounts and purchases

### Purchase
Transaction records from checkout attempts.
- Pricing, seating, and status information
- Price override support for profit calculations
- POS sync tracking (dashboardPoNumber)

### Event
Event information with pricing data.
- Zone-based pricing from secondary markets
- Venue mapping for section-level prices

### Listing
Cached ticket listings from TicketVault POS.
- Links to purchases via extPONumber
- Real-time price sync to POS

### Sale
Sales records from TicketVault.
- Links to listings and invoices
- Fulfillment status tracking

## Development

### Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes to database
npx prisma db push

# Open Prisma Studio (database GUI)
npx prisma studio

# Seed initial data
npm run db:seed
```

### Building

```bash
npm run build
npm run start
```

### Linting

```bash
npm run lint
```

## Data Import/Export

### Import Accounts
POST to `/api/import/accounts` with CSV containing:
- Email, Password, Status, IMAP Provider

### Import Card Profiles
POST to `/api/import/card-profiles` with CSV containing:
- Email, Profile Name, Card Number, CVV, Billing Info

### Export Profiles
GET `/api/export/profiles` for Discord bot integration format.

## Contributing

1. Create a feature branch
2. Make changes and test locally
3. Ensure no linter errors
4. Submit a pull request

## License

Private - All rights reserved
