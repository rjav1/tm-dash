# TM Accounts Dashboard - Development Guide

## Overview

This dashboard manages Ticketmaster accounts, purchases, and integrates with **TicketVault POS** for ticket inventory management. It provides bidirectional synchronization between purchases made through the dashboard and TicketVault's POS system.

---

## Architecture

### Tech Stack
- **Frontend**: Next.js 14+ (App Router), React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **POS Integration**: TicketVault POS API

### Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| `ticketvault-api.ts` | `src/lib/services/` | TicketVault POS API client |
| `listing-service.ts` | `src/lib/services/` | Cached listings management |
| `pos-sync.ts` | `src/lib/services/` | Purchase → POS sync logic |

---

## TicketVault POS Integration

### Authentication
```typescript
// Token is cached in memory and auto-refreshes
await TicketVaultApi.ensureAuthenticated();
```

Credentials are stored in environment variables:
- `TICKETVAULT_USERNAME`
- `TICKETVAULT_PASSWORD`

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/GetOperationsInfo` | POST | Fetch all ticket listings |
| `/api/SaveTickets` | POST | Upload tickets to POS |
| `/api/ticketGroup/price` | POST | Update listing price |
| `/api/settings/seasonsiteslist` | POST | Get connected accounts |
| `/api/settings/refreshseasonsites` | PUT | Trigger account sync |
| `/api/BuyIn/EventSearch` | POST | Search for events |

### Price Updates

Direct price updates to TicketVault use the dedicated endpoint:

```typescript
// src/lib/services/ticketvault-api.ts
export async function updateListingPrice(
  ticketGroupId: number,
  newPrice: number,
  productionId?: number
): Promise<{ success: boolean }> {
  const request = {
    TicketGroupID: ticketGroupId,
    MarketPrice: newPrice,
    ProductionID: prodId,
    UiTimeZone: "America/New_York",
  };
  
  await fetch(`${BASE_URL}/api/ticketGroup/price`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}
```

### Event Matching Logic

When syncing purchases to POS, events are matched using:

1. **Artist Name** (primary) - Uses `purchase.event.artistName`
2. **Venue Name** (extracted) - Uses first part before comma: "United Center" from "United Center, Chicago, IL"
3. **Event Date** - Exact date match

```typescript
// src/lib/services/pos-sync.ts
const posEvent = await findMatchingPosEvent(
  purchase.event.artistName,  // Primary search term
  purchase.event.eventName,   // Fallback
  purchase.event.venue || "",
  eventDate
);
```

### Account Sync Metadata

The dashboard tracks when TicketVault last synced each account:

```prisma
// schema.prisma - Account model
model Account {
  // ... other fields
  posSeasonSiteId     Int?       // TicketVault CompanySeasonSiteID
  posLastCheckedAt    DateTime?  // When TV last synced this account
  posSyncStatus       String?    // "Completed", "Error", "Processing"
  posLastError        String?    // Last sync error message
  posTicketsFound     Int?       // Tickets found in last sync
  posTicketsUpdated   Int?       // Tickets updated in last sync
}
```

---

## Data Models

### Purchase Order Numbers

Each purchase gets a unique `dashboardPoNumber` when synced to POS:

```typescript
// Format: 6-digit zero-padded sequential number
// Example: "000001", "000002", etc.

// Atomic generation to prevent duplicates
await prisma.purchase.update({
  where: { id: purchaseId },
  data: {
    dashboardPoNumber: poNumber.toString().padStart(6, "0"),
  },
});
```

**Important**: The `dashboardPoNumber` field has a unique constraint in the database.

### Listings (POS Cache)

Listings are cached locally from TicketVault for faster querying:

```prisma
model Listing {
  ticketGroupId    Int      @unique  // TicketVault's ID
  extPONumber      String?            // Links to our dashboardPoNumber
  accountEmail     String?            // Account that purchased
  cost             Decimal            // Cost per ticket
  price            Decimal            // Current listing price
  // ... many other fields
}
```

### Total Cost Calculation

Total cost is calculated as `SUM(cost * quantity)` for "our tickets" (those with `extPONumber`):

```typescript
// src/lib/services/listing-service.ts
const totalCostResult = await prisma.$queryRaw`
  SELECT SUM(cost * quantity) as total
  FROM "listings"
  WHERE "ext_po_number" IS NOT NULL
`;
```

---

## Frontend Pages

### Listings Page (`/listings`)

Displays POS inventory synced from TicketVault.

**Features:**
- Sync listings from POS
- View all ticket inventory
- **Inline price editing** - Click on price to edit, updates TicketVault directly
- Filter by event, match status, ownership
- **Total Cost** column showing `cost * quantity` per listing
- **Last Matched** column showing when the account was last synced

**Stats Cards:**
- Total Listings
- Matched count
- Our Tickets (with Ext PO#)
- Total Cost (sum of all our tickets)

### Purchases Page (`/purchases`)

Displays all ticket purchases from the dashboard.

**Filters:**
- Event, Status, Section, Row, Seats
- Quantity (min/max)
- Order Number (TM order number)
- Date range

**Actions:**
- Export to POS (sync selected purchases)
- Bulk selection

---

## Common Tasks

### Adding a New TicketVault API Endpoint

1. Add interface for request/response in `ticketvault-api.ts`
2. Implement the function with proper authentication
3. Export from the `TicketVaultApi` object

```typescript
// Example pattern
export async function newEndpoint(params: NewParams): Promise<NewResponse> {
  await ensureAuthenticated();
  
  const response = await fetch(`${BASE_URL}/api/new-endpoint`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    throw new Error(`TicketVault API failed: ${response.status}`);
  }
  
  return response.json();
}
```

### Running Database Migrations

```bash
# Development - create migration
npx prisma migrate dev --name description_of_changes

# If drift detected, push schema directly
npx prisma db push

# Regenerate client (restart dev server if locked)
npx prisma generate
```

### Debugging POS Sync Issues

1. Check the console logs for `[TicketVault]` and `[ListingService]` prefixes
2. Common issues:
   - **"Could not find matching event"** - Check artist name and venue parsing
   - **"Could not find stubhub event"** - Event exists but lacks marketplace mapping in TicketVault
   - **Price not updating** - Ensure `ProductionID` is passed to price update

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/listings` | GET | Fetch cached listings with filters |
| `/api/listings` | POST | Trigger sync from TicketVault |
| `/api/listings/[id]` | PATCH | Update listing (price syncs to TV) |
| `/api/listings/[id]/match` | POST | Trigger account sync in TV |
| `/api/listings/events` | GET | Get unique event names for filter |
| `/api/purchases` | GET | Fetch purchases with filters |
| `/api/pos/sync` | POST | Sync purchases to POS |
| `/api/pos/fix-duplicates` | GET/POST | Find/fix duplicate PO numbers |

---

## Environment Variables

```env
# Database - Supabase (Session Pooler for IPv4 compatibility)
# Get from: Supabase Dashboard > Project Settings > Database > Connection String > Session Pooler
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# TicketVault POS (optional - for POS integration)
TICKETVAULT_USERNAME="your-username"
TICKETVAULT_PASSWORD="your-password"

# Optional
NODE_ENV="development"
```

See `.env.example` for a template.

---

## Troubleshooting

### "Relation does not exist" Error
- Table names in raw SQL must be lowercase: `"listings"` not `"Listing"`

### Prisma Generate Permission Error
- Restart the dev server to release file locks, then run `npx prisma generate`

### Price Updates Not Syncing
- Verify the `/api/ticketGroup/price` endpoint is being used
- Check that `ProductionID` is available (fetched from existing listing data)

### Duplicate PO Numbers
- Use `/api/pos/fix-duplicates` to identify and resolve
- New purchases use atomic PO generation to prevent duplicates

---

## Code Style Guidelines

1. **Service Layer**: All TicketVault API calls go through `ticketvault-api.ts`
2. **Error Handling**: Always wrap API calls in try/catch with meaningful error messages
3. **Logging**: Use prefixes like `[ServiceName]` for console logs
4. **Types**: Define interfaces for all API request/response structures
5. **Database**: Use Prisma for all database operations; raw SQL only when necessary

---

## Recent Changes (January 2026)

### POS Price Sync
- Added direct price updates to TicketVault via `/api/ticketGroup/price`
- Dashboard price changes now sync immediately to POS

### Event Matching Improvement
- Switched from full event name parsing to using `artistName` field
- Added venue name extraction (removes city/state suffix)
- Improved search term generation for edge cases

### Account Sync Metadata
- Added `posLastCheckedAt` and related fields to Account model
- Listings page shows "Last Matched" column per account
- Account metadata syncs automatically during listing sync

### Total Cost Column
- Added "Total Cost" column to listings (`cost * quantity`)
- Fixed stats calculation to use `SUM(cost * quantity)` for accurate totals

### Enhanced Filtering
- Added Row, Seats, Quantity (min/max), Order Number filters to Purchases page

### POS Export Preview & Split Types
- Added preview modal before exporting to POS - review purchases and modify settings
- Configurable **Split Types** per purchase:
  - `None (0)`: All or nothing - buyer must purchase all
  - `Pairs (2)`: Multiples of 2 only **(new default)**
  - `Avoid Singles (3)`: Any quantity but won't leave single ticket
  - `Any (4)`: Any quantity allowed
- Configurable **Listing Price** per purchase (default: $9,999)
- Split type constants exported from `ticketvault-api.ts`:
  ```typescript
  import { SPLIT_TYPES, SPLIT_TYPE_LABELS } from "@/lib/services/ticketvault-api";
  ```
