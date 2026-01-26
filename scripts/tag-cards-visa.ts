/**
 * One-time script to:
 * 1. Create the "visa" card tag (if not exists)
 * 2. Tag all existing cards with the "visa" tag
 * 
 * Run with: npx ts-node scripts/tag-cards-visa.ts
 */

import prisma from "../src/lib/db";

async function main() {
  console.log("Starting card tagging...");

  // Create or find visa tag
  let visaTag = await prisma.cardTag.findUnique({
    where: { name: "visa" },
  });

  if (!visaTag) {
    visaTag = await prisma.cardTag.create({
      data: {
        name: "visa",
        color: "#1a1f71", // Visa blue
      },
    });
    console.log("Created 'visa' tag:", visaTag.id);
  } else {
    console.log("'visa' tag already exists:", visaTag.id);
  }

  // Also create amex tag for future use
  let amexTag = await prisma.cardTag.findUnique({
    where: { name: "amex" },
  });

  if (!amexTag) {
    amexTag = await prisma.cardTag.create({
      data: {
        name: "amex",
        color: "#006fcf", // Amex blue
      },
    });
    console.log("Created 'amex' tag:", amexTag.id);
  } else {
    console.log("'amex' tag already exists:", amexTag.id);
  }

  // Get all card IDs
  const cards = await prisma.card.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  console.log(`Found ${cards.length} active cards to tag...`);

  // Tag all cards with visa
  let taggedCount = 0;
  for (const card of cards) {
    try {
      await prisma.card.update({
        where: { id: card.id },
        data: {
          tags: {
            connect: { id: visaTag.id },
          },
        },
      });
      taggedCount++;
    } catch {
      // Skip if already connected
    }
  }

  console.log(`Tagged ${taggedCount} cards with 'visa' tag`);
  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
