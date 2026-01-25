# TM Accounts Dashboard

A Next.js application for managing Ticketmaster accounts, card profiles, purchases, and event tracking.

## Features

- **Account Management**: Track and manage Ticketmaster accounts with status, IMAP configuration, and activity history
- **Card Profiles**: Manage payment card profiles linked to accounts with soft-delete support
- **Purchase Tracking**: View and analyze purchase history with profit calculations
- **Event Management**: Track events with pricing data from secondary markets
- **Queue Testing**: Monitor queue positions across accounts for events
- **Analytics**: Account rankings, success rates, and revenue statistics

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **UI**: Tailwind CSS + shadcn/ui components
- **TypeScript**: Full type safety throughout

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tm-accounts
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL
```

4. Initialize the database:
```bash
npx prisma db push
npx prisma generate
```

5. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to view the application.

## Project Structure

```
tm-accounts/
├── prisma/
│   └── schema.prisma         # Database schema
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── api/              # API routes
│   │   │   ├── accounts/     # Account CRUD operations
│   │   │   ├── cards/        # Card profile management
│   │   │   ├── purchases/    # Purchase tracking
│   │   │   ├── events/       # Event management
│   │   │   ├── queues/       # Queue position tracking
│   │   │   ├── stats/        # Dashboard statistics
│   │   │   ├── import/       # Data import endpoints
│   │   │   └── export/       # Data export endpoints
│   │   ├── accounts/         # Accounts page
│   │   ├── cards/            # Card profiles page
│   │   ├── purchases/        # Purchases page
│   │   └── events/           # Events page
│   ├── components/           # Reusable React components
│   │   ├── ui/               # shadcn/ui components
│   │   └── *.tsx             # Feature components
│   └── lib/                  # Utilities and services
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
| GET | `/api/cards/[id]` | Get single card with details |
| PATCH | `/api/cards` | Bulk soft delete/restore cards |
| PATCH | `/api/cards/[id]` | Update card |
| DELETE | `/api/cards/[id]` | Soft delete card |

### Purchases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchases` | List purchases with stats |
| POST | `/api/purchases` | Create manual purchase |
| PATCH | `/api/purchases` | Bulk update purchases |
| PATCH | `/api/purchases/[id]` | Update single purchase |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events |
| GET | `/api/events/[id]` | Get event details |
| POST | `/api/events/[id]/sync-prices` | Sync pricing from secondary market |

## Database Models

### Account
Stores Ticketmaster account credentials and status.
- Supports multiple linked cards (one-to-many relationship)
- Tracks purchase history and queue testing results

### Card
Payment card profiles for checkout.
- Soft delete support (deletedAt field)
- Links to accounts and purchases

### Purchase
Transaction records from checkout attempts.
- Includes pricing, seating, and status information
- Price override support for profit calculations

### Event
Event information with pricing data.
- Zone-based pricing from secondary markets
- Venue mapping for section-level prices

## Development

### Running Migrations

After modifying `prisma/schema.prisma`:

```bash
npx prisma db push
npx prisma generate
```

### Linting

```bash
npm run lint
```

### Building

```bash
npm run build
```

## Data Import/Export

### Import Accounts
POST to `/api/import/accounts` with CSV data containing:
- Email, Password, Status, IMAP Provider

### Export Profiles
GET `/api/export/profiles` for Discord bot integration format:
- Outputs account + card profile data in CSV format

## Contributing

1. Create a feature branch
2. Make changes and test locally
3. Ensure no linter errors
4. Submit a pull request

## License

Private - All rights reserved
