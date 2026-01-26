# Profit Calculation Architecture

This document explains how profit is calculated in the TM Dashboard, and the reasoning behind the implementation.

## TL;DR

**Always calculate profit from INVOICES, not from individual Sales.**

```
Total Profit = Sum(invoice.totalAmount) - Sum(invoice.totalCost)
```

This matches exactly what TicketVault shows when you sum your invoices.

---

## Data Model Overview

### Hierarchy

```
Purchase (what we bought from Ticketmaster)
    └── Listing (what we listed on TicketVault)
            └── Sale (individual sale from that listing)
                    └── Invoice (buyer's complete transaction)
```

### Key Relationships

| Relationship | Cardinality | Example |
|--------------|-------------|---------|
| Purchase → Listings | One to Many | 1 purchase can be listed on multiple platforms |
| Listing → Sales | One to Many | 1 listing can have multiple partial sales |
| Invoice → Sales | One to Many | 1 invoice can contain sales from multiple listings |
| Sale → Invoice | Many to One | Each sale belongs to exactly 1 invoice |

**Critical Insight**: A single Invoice can contain multiple Sales. This happens when a buyer purchases tickets from multiple of our listings in one transaction.

---

## Invoice vs Sale Fields

### Invoice (Source of Truth for Financials)

| Field | Description | Source |
|-------|-------------|--------|
| `totalAmount` | NET payout after TicketVault fees | TicketVault "Payout" field |
| `totalCost` | Our purchase cost | TicketVault "TotalCost" field |
| `fees` | TicketVault's marketplace fee | TicketVault "TVFee" field |

### Sale (DO NOT use for profit aggregation)

| Field | Description | Warning |
|-------|-------------|---------|
| `salePrice` | GROSS amount before fees | Not suitable for profit calculation! |
| `cost` | Per-ticket cost | Must multiply by quantity |

---

## The Right Way: Invoice-Based Calculation

```typescript
// From: src/lib/services/sales-sync.ts

const invoiceAggregates = await prisma.invoice.aggregate({
  where: { isCancelled: false },
  _sum: {
    totalAmount: true,  // NET payout after fees
    totalCost: true,    // Our purchase cost
  },
});

const totalRevenue = Number(invoiceAggregates._sum.totalAmount || 0);
const totalCost = Number(invoiceAggregates._sum.totalCost || 0);
const totalProfit = totalRevenue - totalCost;
```

**Why this works:**
1. `invoice.totalAmount` is the actual net payout (after fees)
2. No fee estimation needed
3. Matches exactly what TicketVault reports

---

## The Wrong Way: Sale-Based Calculation (DON'T DO THIS)

```typescript
// ❌ WRONG - Do NOT calculate profit this way!

const salesWithData = await prisma.sale.findMany({ ... });

for (const sale of salesWithData) {
  // WRONG: Trying to calculate net from gross sale price
  const netPayout = sale.salePrice * 0.93; // Assumes 7% fee - imprecise!
  totalRevenue += netPayout;
  
  // WRONG: Also prone to errors
  const totalCost = sale.cost * sale.quantity;
}
```

**Why this is wrong:**
1. Fee percentage may not be exactly 7%
2. Fee structure might be tiered or variable
3. You're estimating when actual data exists in invoices

---

## Historical Bug (Fixed January 2026)

### The Problem

Previous code used `invoice.totalAmount` **per sale**, which caused double-counting:

```typescript
// ❌ BUG: Used invoice.totalAmount for each sale
for (const sale of sales) {
  const netPayout = sale.invoice?.totalAmount || sale.salePrice * 0.93;
  totalRevenue += netPayout;  // WRONG!
}
```

### What Happened

If Invoice #123 had `totalAmount = $500` and contained 2 sales (Sale A and Sale B):
- Bug added $500 for Sale A + $500 for Sale B = **$1,000** (WRONG!)
- Should have been just **$500** (the invoice total)

### The Fix

Calculate profit from invoices directly, not by iterating through sales:

```typescript
// ✅ CORRECT: Sum invoices directly
const invoiceAggregates = await prisma.invoice.aggregate({
  where: { isCancelled: false },
  _sum: { totalAmount: true, totalCost: true },
});
```

---

## Files That Handle Profit Calculation

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Data model definitions with documentation |
| `src/lib/services/sales-sync.ts` | `getSalesStats()` - main profit calculation |
| `src/app/api/stats/route.ts` | Dashboard realized/unrealized profit |
| `src/app/api/purchases/route.ts` | Per-purchase profit display |
| `src/app/sales/page.tsx` | Client-side per-page metrics (estimate only) |

---

## Testing Profit Accuracy

To verify profit matches TicketVault:

1. In TicketVault, go to Invoices and sum the "Payout" column
2. In our dashboard, check the "Total Profit" metric
3. They should match (or be very close, within rounding)

If they don't match, check:
- Are all invoices synced? (`/api/invoices` POST to sync)
- Are there cancelled invoices being incorrectly included?
- Is `invoice.totalCost` properly populated?

---

## Summary

| Do This | Don't Do This |
|---------|---------------|
| Sum `invoice.totalAmount` for revenue | Sum `sale.salePrice` for revenue |
| Sum `invoice.totalCost` for cost | Sum `sale.cost * quantity` across sales |
| Use invoice aggregates | Iterate through sales and sum |
| Trust TicketVault's net payout | Estimate fees from gross prices |
