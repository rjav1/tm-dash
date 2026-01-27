/**
 * Auto-Tagging Service
 * 
 * Automatically applies tags to accounts and cards based on their status:
 * 
 * ACCOUNTS:
 * - "Tested" - Account has been tested in at least one queue
 * - "Purchased" - Account has at least one purchase
 * - "1 Purchase", "2 Purchases", "3+ Purchases" - Purchase count tags
 * 
 * CARDS:
 * - Purchase count tags based on number of purchases
 */

import prisma from "@/lib/db";

// Tag definitions with colors
const ACCOUNT_TAG_DEFINITIONS = {
  tested: { name: "Tested", color: "#3B82F6" },      // Blue
  purchased: { name: "Purchased", color: "#10B981" }, // Green
  "1-purchase": { name: "1 Purchase", color: "#F59E0B" },   // Amber
  "2-purchases": { name: "2 Purchases", color: "#F97316" }, // Orange
  "3-purchases": { name: "3+ Purchases", color: "#EF4444" }, // Red
};

const CARD_TAG_DEFINITIONS = {
  "1-purchase": { name: "1 Purchase", color: "#F59E0B" },
  "2-purchases": { name: "2 Purchases", color: "#F97316" },
  "3-purchases": { name: "3+ Purchases", color: "#EF4444" },
};

/**
 * Ensure a tag exists, create if not
 */
async function ensureAccountTag(key: keyof typeof ACCOUNT_TAG_DEFINITIONS) {
  const def = ACCOUNT_TAG_DEFINITIONS[key];
  
  let tag = await prisma.accountTag.findUnique({
    where: { name: def.name },
  });
  
  if (!tag) {
    tag = await prisma.accountTag.create({
      data: {
        name: def.name,
        color: def.color,
      },
    });
    console.log(`[Auto-Tag] Created account tag: ${def.name}`);
  }
  
  return tag;
}

async function ensureCardTag(key: keyof typeof CARD_TAG_DEFINITIONS) {
  const def = CARD_TAG_DEFINITIONS[key];
  
  let tag = await prisma.cardTag.findUnique({
    where: { name: def.name },
  });
  
  if (!tag) {
    tag = await prisma.cardTag.create({
      data: {
        name: def.name,
        color: def.color,
      },
    });
    console.log(`[Auto-Tag] Created card tag: ${def.name}`);
  }
  
  return tag;
}

/**
 * Apply "Tested" tag to all accounts that have been tested in queues
 */
export async function tagTestedAccounts(): Promise<{ tagged: number }> {
  const testedTag = await ensureAccountTag("tested");
  
  // Find all accounts with at least one queue position
  const testedAccounts = await prisma.account.findMany({
    where: {
      queuePositions: { some: {} },
      NOT: {
        tags: { some: { id: testedTag.id } },
      },
    },
    select: { id: true },
  });
  
  if (testedAccounts.length === 0) {
    return { tagged: 0 };
  }
  
  // Tag them
  await prisma.accountTag.update({
    where: { id: testedTag.id },
    data: {
      accounts: {
        connect: testedAccounts.map((a) => ({ id: a.id })),
      },
    },
  });
  
  console.log(`[Auto-Tag] Tagged ${testedAccounts.length} accounts as "Tested"`);
  return { tagged: testedAccounts.length };
}

/**
 * Apply "Purchased" tag to all accounts that have purchases
 */
export async function tagPurchasedAccounts(): Promise<{ tagged: number }> {
  const purchasedTag = await ensureAccountTag("purchased");
  
  // Find all accounts with at least one purchase
  const purchasedAccounts = await prisma.account.findMany({
    where: {
      purchases: { some: {} },
      NOT: {
        tags: { some: { id: purchasedTag.id } },
      },
    },
    select: { id: true },
  });
  
  if (purchasedAccounts.length === 0) {
    return { tagged: 0 };
  }
  
  // Tag them
  await prisma.accountTag.update({
    where: { id: purchasedTag.id },
    data: {
      accounts: {
        connect: purchasedAccounts.map((a) => ({ id: a.id })),
      },
    },
  });
  
  console.log(`[Auto-Tag] Tagged ${purchasedAccounts.length} accounts as "Purchased"`);
  return { tagged: purchasedAccounts.length };
}

/**
 * Apply purchase count tags to accounts
 */
export async function tagAccountsByPurchaseCount(): Promise<{ tagged: Record<string, number> }> {
  const tag1 = await ensureAccountTag("1-purchase");
  const tag2 = await ensureAccountTag("2-purchases");
  const tag3 = await ensureAccountTag("3-purchases");
  
  const result = { "1 Purchase": 0, "2 Purchases": 0, "3+ Purchases": 0 };
  
  // Get accounts with purchase counts
  const accountsWithCounts = await prisma.account.findMany({
    where: { purchases: { some: {} } },
    select: {
      id: true,
      _count: { select: { purchases: true } },
      tags: { select: { id: true } },
    },
  });
  
  const toTag1: string[] = [];
  const toTag2: string[] = [];
  const toTag3: string[] = [];
  const toUntag1: string[] = [];
  const toUntag2: string[] = [];
  const toUntag3: string[] = [];
  
  for (const account of accountsWithCounts) {
    const count = account._count.purchases;
    const hasTag1 = account.tags.some((t) => t.id === tag1.id);
    const hasTag2 = account.tags.some((t) => t.id === tag2.id);
    const hasTag3 = account.tags.some((t) => t.id === tag3.id);
    
    if (count === 1) {
      if (!hasTag1) toTag1.push(account.id);
      if (hasTag2) toUntag2.push(account.id);
      if (hasTag3) toUntag3.push(account.id);
    } else if (count === 2) {
      if (hasTag1) toUntag1.push(account.id);
      if (!hasTag2) toTag2.push(account.id);
      if (hasTag3) toUntag3.push(account.id);
    } else if (count >= 3) {
      if (hasTag1) toUntag1.push(account.id);
      if (hasTag2) toUntag2.push(account.id);
      if (!hasTag3) toTag3.push(account.id);
    }
  }
  
  // Apply tags
  if (toTag1.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag1.id },
      data: { accounts: { connect: toTag1.map((id) => ({ id })) } },
    });
    result["1 Purchase"] = toTag1.length;
  }
  
  if (toTag2.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag2.id },
      data: { accounts: { connect: toTag2.map((id) => ({ id })) } },
    });
    result["2 Purchases"] = toTag2.length;
  }
  
  if (toTag3.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag3.id },
      data: { accounts: { connect: toTag3.map((id) => ({ id })) } },
    });
    result["3+ Purchases"] = toTag3.length;
  }
  
  // Remove outdated tags
  if (toUntag1.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag1.id },
      data: { accounts: { disconnect: toUntag1.map((id) => ({ id })) } },
    });
  }
  
  if (toUntag2.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag2.id },
      data: { accounts: { disconnect: toUntag2.map((id) => ({ id })) } },
    });
  }
  
  if (toUntag3.length > 0) {
    await prisma.accountTag.update({
      where: { id: tag3.id },
      data: { accounts: { disconnect: toUntag3.map((id) => ({ id })) } },
    });
  }
  
  console.log(`[Auto-Tag] Updated account purchase count tags:`, result);
  return { tagged: result };
}

/**
 * Apply purchase count tags to cards
 */
export async function tagCardsByPurchaseCount(): Promise<{ tagged: Record<string, number> }> {
  const tag1 = await ensureCardTag("1-purchase");
  const tag2 = await ensureCardTag("2-purchases");
  const tag3 = await ensureCardTag("3-purchases");
  
  const result = { "1 Purchase": 0, "2 Purchases": 0, "3+ Purchases": 0 };
  
  // Get cards with purchase counts
  const cardsWithCounts = await prisma.card.findMany({
    where: { purchases: { some: {} } },
    select: {
      id: true,
      _count: { select: { purchases: true } },
      tags: { select: { id: true } },
    },
  });
  
  const toTag1: string[] = [];
  const toTag2: string[] = [];
  const toTag3: string[] = [];
  const toUntag1: string[] = [];
  const toUntag2: string[] = [];
  const toUntag3: string[] = [];
  
  for (const card of cardsWithCounts) {
    const count = card._count.purchases;
    const hasTag1 = card.tags.some((t) => t.id === tag1.id);
    const hasTag2 = card.tags.some((t) => t.id === tag2.id);
    const hasTag3 = card.tags.some((t) => t.id === tag3.id);
    
    if (count === 1) {
      if (!hasTag1) toTag1.push(card.id);
      if (hasTag2) toUntag2.push(card.id);
      if (hasTag3) toUntag3.push(card.id);
    } else if (count === 2) {
      if (hasTag1) toUntag1.push(card.id);
      if (!hasTag2) toTag2.push(card.id);
      if (hasTag3) toUntag3.push(card.id);
    } else if (count >= 3) {
      if (hasTag1) toUntag1.push(card.id);
      if (hasTag2) toUntag2.push(card.id);
      if (!hasTag3) toTag3.push(card.id);
    }
  }
  
  // Apply tags
  if (toTag1.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag1.id },
      data: { cards: { connect: toTag1.map((id) => ({ id })) } },
    });
    result["1 Purchase"] = toTag1.length;
  }
  
  if (toTag2.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag2.id },
      data: { cards: { connect: toTag2.map((id) => ({ id })) } },
    });
    result["2 Purchases"] = toTag2.length;
  }
  
  if (toTag3.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag3.id },
      data: { cards: { connect: toTag3.map((id) => ({ id })) } },
    });
    result["3+ Purchases"] = toTag3.length;
  }
  
  // Remove outdated tags
  if (toUntag1.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag1.id },
      data: { cards: { disconnect: toUntag1.map((id) => ({ id })) } },
    });
  }
  
  if (toUntag2.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag2.id },
      data: { cards: { disconnect: toUntag2.map((id) => ({ id })) } },
    });
  }
  
  if (toUntag3.length > 0) {
    await prisma.cardTag.update({
      where: { id: tag3.id },
      data: { cards: { disconnect: toUntag3.map((id) => ({ id })) } },
    });
  }
  
  console.log(`[Auto-Tag] Updated card purchase count tags:`, result);
  return { tagged: result };
}

/**
 * Run all auto-tagging operations
 */
export async function runAutoTagging(): Promise<{
  accounts: {
    tested: number;
    purchased: number;
    purchaseCounts: Record<string, number>;
  };
  cards: {
    purchaseCounts: Record<string, number>;
  };
}> {
  console.log("[Auto-Tag] Starting auto-tagging...");
  
  const [tested, purchased, accountCounts, cardCounts] = await Promise.all([
    tagTestedAccounts(),
    tagPurchasedAccounts(),
    tagAccountsByPurchaseCount(),
    tagCardsByPurchaseCount(),
  ]);
  
  console.log("[Auto-Tag] Completed auto-tagging");
  
  return {
    accounts: {
      tested: tested.tagged,
      purchased: purchased.tagged,
      purchaseCounts: accountCounts.tagged,
    },
    cards: {
      purchaseCounts: cardCounts.tagged,
    },
  };
}
