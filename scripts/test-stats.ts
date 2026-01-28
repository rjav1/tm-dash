/**
 * Test the getSalesStats function
 */
import { getSalesStats } from "../src/lib/services/sales-sync";

async function test() {
  console.log("Testing getSalesStats()...\n");
  const stats = await getSalesStats();
  console.log("Results:");
  console.log(`  Total Sales: ${stats.totalSales}`);
  console.log(`  Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
  console.log(`  Total Cost: $${stats.totalCost.toFixed(2)}`);
  console.log(`  Total Profit: $${stats.totalProfit.toFixed(2)}`);
  console.log(`  Avg Profit/Day: $${stats.avgProfitPerDay.toFixed(2)}`);
  console.log(`  Days with Sales: ${stats.daysWithSales}`);
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
