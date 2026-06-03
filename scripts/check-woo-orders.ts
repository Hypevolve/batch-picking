import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WOO_API_URL = process.env.WOO_API_URL?.replace(/\/$/, "") || "";
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY || "";
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET || "";

function getAuthHeader(): string {
  const credentials = Buffer.from(
    `${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`
  ).toString("base64");
  return `Basic ${credentials}`;
}

async function wooFetch(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${WOO_API_URL}/wp-json/wc/v3${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `WooCommerce API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function main() {
  console.log("=== WooCommerce statusi ===\n");

  // Dohvati prvih 100 narudzbi (bilo kojeg statusa) u zadnjih 30 dana
  const after30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentOrders = await wooFetch("/orders", {
    after: after30.toISOString(),
    per_page: "100",
    page: "1",
  });

  const statusCounts: Record<string, number> = {};
  recentOrders.forEach((o: any) => {
    const s = o.status;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  console.log("Jedinstveni statusi u zadnjih 30 dana:");
  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

  console.log(`\nUkupno: ${recentOrders.length}`);
}

main().catch(console.error);
