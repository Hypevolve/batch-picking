const WOO_API_URL = process.env.WOO_API_URL?.replace(/\/$/, "") || "";
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY || "";
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET || "";

interface WooOrderItem {
  id: number;
  name: string;
  product_id: number;
  quantity: number;
  sku: string;
  image?: { src: string };
}

interface WooOrder {
  id: number;
  status: string;
  billing: {
    first_name: string;
    last_name: string;
  };
  line_items: WooOrderItem[];
  date_created: string;
}

interface WooProduct {
  id: number;
  sku: string;
  name: string;
  images: { src: string }[];
  meta_data: { key: string; value: string }[];
}

function getAuthHeader(): string {
  const credentials = Buffer.from(
    `${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`
  ).toString("base64");
  return `Basic ${credentials}`;
}

async function wooFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
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

  return response.json() as Promise<T>;
}

export async function fetchProcessingOrders(
  page = 1,
  perPage = 100
): Promise<WooOrder[]> {
  return wooFetch<WooOrder[]>("/orders", {
    status: "processing",
    page: String(page),
    per_page: String(perPage),
  });
}

export async function fetchProductBySku(sku: string): Promise<WooProduct | null> {
  const products = await wooFetch<WooProduct[]>("/products", { sku });
  return products.length > 0 ? products[0] : null;
}

export async function updateOrderStatus(
  orderId: number,
  status: string
): Promise<void> {
  const url = `${WOO_API_URL}/wp-json/wc/v3/orders/${orderId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(
      `WooCommerce status update failed: ${response.status} ${response.statusText}`
    );
  }
}

export type { WooOrder, WooOrderItem, WooProduct };
