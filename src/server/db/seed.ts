import "dotenv/config";
import { supabaseAdmin } from "./supabase-admin";

async function seed() {
  console.log("🚀 Starting database seeding process...");

  // 1. Clean existing records (in dependency order)
  console.log("🧹 Cleaning up old data from database...");
  
  try {
    // Delete logs, batch mappings, items
    const { error: err1 } = await supabaseAdmin.from("activity_logs").delete().neq("id", 0);
    const { error: err2 } = await supabaseAdmin.from("batch_items").delete().neq("id", 0);
    const { error: err3 } = await supabaseAdmin.from("batch_orders").delete().neq("id", 0);
    const { error: err4 } = await supabaseAdmin.from("batches").delete().neq("id", 0);
    const { error: err5 } = await supabaseAdmin.from("order_items").delete().neq("id", 0);
    const { error: err6 } = await supabaseAdmin.from("orders").delete().neq("id", 0);
    const { error: err7 } = await supabaseAdmin.from("product_locations").delete().neq("id", 0);
    const { error: err8 } = await supabaseAdmin.from("products").delete().neq("id", 0);
    const { error: err9 } = await supabaseAdmin.from("picking_routes").delete().neq("id", 0);
    const { error: err10 } = await supabaseAdmin.from("users").delete().neq("id", 0);

    if (err1 || err2 || err3 || err4 || err5 || err6 || err7 || err8 || err9 || err10) {
      console.warn("⚠️ Some deletion queries returned errors or warnings. Continuing...");
    } else {
      console.log("✅ Database successfully cleared.");
    }
  } catch (err) {
    console.error("❌ Error while clearing tables:", err);
  }

  // 2. Insert Users
  console.log("👤 Seeding user accounts...");
  const users = [
    {
      email: "admin@libar.hr",
      name: "Skladišni Administrator",
      password_hash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", // admin123
      role: "admin",
      active: true,
    },
    {
      email: "picker@libar.hr",
      name: "Operater Picker",
      password_hash: "5a7e575cadc6c94e81d64754326ff66e9e6d570a0588b1e5bf8fb1e210045487", // picker123
      role: "picker",
      active: true,
    },
  ];

  const { error: userError } = await supabaseAdmin.from("users").insert(users);
  if (userError) {
    console.error("❌ Failed to seed users:", userError.message);
    return;
  }
  console.log("✅ Seeded users successfully (admin@libar.hr / picker@libar.hr).");

  // 3. Insert Picking Routes
  console.log("🗺️ Seeding warehouse zones...");
  const zones = [
    { zone_code: "ZONA-A", zone_name: "Područje A - Knjige", sort_order: 1 },
    { zone_code: "ZONA-B", zone_name: "Područje B - Uredski Pribor", sort_order: 2 },
    { zone_code: "ZONA-C", zone_name: "Područje C - Pokloni i Društvene Igre", sort_order: 3 },
  ];

  const { error: zoneError } = await supabaseAdmin.from("picking_routes").insert(zones);
  if (zoneError) {
    console.error("❌ Failed to seed zones:", zoneError.message);
    return;
  }
  console.log("✅ Seeded warehouse zones successfully.");

  // 4. Insert Products
  console.log("📦 Seeding catalog products...");
  const sampleProducts = [
    // Books (ZONA-A)
    { sku: "SKU-BOOK-001", title: "Mali Princ - Antoine de Saint-Exupéry", image_url: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop", author: "A. de Saint-Exupéry" },
    { sku: "SKU-BOOK-002", title: "Harry Potter i Kamen Mudraca", image_url: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop", author: "J.K. Rowling" },
    { sku: "SKU-BOOK-003", title: "Gospodar Prstenova: Prstenova Družina", image_url: "https://images.unsplash.com/photo-1621351183012-e2f9972dd9bf?w=200&auto=format&fit=crop", author: "J.R.R. Tolkien" },
    // Stationery (ZONA-B)
    { sku: "SKU-PAPER-001", title: "Premium Bilježnica A4 Libar (Lined)", image_url: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=200&auto=format&fit=crop" },
    { sku: "SKU-PAPER-002", title: "Blok za skiciranje A3 Fabriano", image_url: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=200&auto=format&fit=crop" },
    { sku: "SKU-PEN-001", title: "Kemijska olovka Parker Jotter Premium (Blue)", image_url: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=200&auto=format&fit=crop" },
    { sku: "SKU-PEN-002", title: "Set drvenih bojica Staedtler 24/1", image_url: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=200&auto=format&fit=crop" },
    // Gifts (ZONA-C)
    { sku: "SKU-GIFT-001", title: "Keramička Šalica: 'Najbolji Picker na Svijetu'", image_url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop" },
    { sku: "SKU-GIFT-002", title: "Ukrasna mirisna svijeća Lavanda Hvar", image_url: "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=200&auto=format&fit=crop" },
    { sku: "SKU-GIFT-003", title: "Društvena igra 'Čovječe ne ljuti se' Drvena", image_url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=200&auto=format&fit=crop" },
  ];

  const { error: productError } = await supabaseAdmin.from("products").insert(sampleProducts);
  if (productError) {
    console.error("❌ Failed to seed products:", productError.message);
    return;
  }
  console.log("✅ Seeded product catalog successfully.");

  // 5. Insert Product Locations (Shelf mappings and route sequence positions)
  console.log("📍 Seeding product locations...");
  const locations = [
    { sku: "SKU-BOOK-001", zone_code: "ZONA-A", shelf_code: "A-1-1", route_position: 10 },
    { sku: "SKU-BOOK-002", zone_code: "ZONA-A", shelf_code: "A-1-2", route_position: 20 },
    { sku: "SKU-BOOK-003", zone_code: "ZONA-A", shelf_code: "A-2-1", route_position: 30 },
    
    { sku: "SKU-PAPER-001", zone_code: "ZONA-B", shelf_code: "B-1-1", route_position: 100 },
    { sku: "SKU-PAPER-002", zone_code: "ZONA-B", shelf_code: "B-1-2", route_position: 110 },
    { sku: "SKU-PEN-001", zone_code: "ZONA-B", shelf_code: "B-2-1", route_position: 120 },
    { sku: "SKU-PEN-002", zone_code: "ZONA-B", shelf_code: "B-2-2", route_position: 130 },
    
    { sku: "SKU-GIFT-001", zone_code: "ZONA-C", shelf_code: "C-1-1", route_position: 200 },
    { sku: "SKU-GIFT-002", zone_code: "ZONA-C", shelf_code: "C-1-2", route_position: 210 },
    { sku: "SKU-GIFT-003", zone_code: "ZONA-C", shelf_code: "C-2-1", route_position: 220 },
  ];

  const { error: locationError } = await supabaseAdmin.from("product_locations").insert(locations);
  if (locationError) {
    console.error("❌ Failed to seed product locations:", locationError.message);
    return;
  }
  console.log("✅ Seeded product locations successfully.");

  // 6. Insert Orders and Nested Order Items
  console.log("🛒 Seeding active orders to test SKU-overlap grouping algorithms...");

  const ordersData = [
    // --- Cluster 1: High book / paper overlaps (Expected to group in Batch 1) ---
    {
      woo_order_id: 10101,
      customer_name: "Ivan Horvat",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-BOOK-001", quantity: 1, title: "Mali Princ - Antoine de Saint-Exupéry", img: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop" },
        { sku: "SKU-BOOK-002", quantity: 1, title: "Harry Potter i Kamen Mudraca", img: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-001", quantity: 2, title: "Kemijska olovka Parker Jotter Premium (Blue)", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10102,
      customer_name: "Marija Kovač",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-BOOK-001", quantity: 2, title: "Mali Princ - Antoine de Saint-Exupéry", img: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop" },
        { sku: "SKU-BOOK-002", quantity: 1, title: "Harry Potter i Kamen Mudraca", img: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop" },
        { sku: "SKU-PAPER-001", quantity: 1, title: "Premium Bilježnica A4 Libar (Lined)", img: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10103,
      customer_name: "Marko Babić",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-BOOK-002", quantity: 1, title: "Harry Potter i Kamen Mudraca", img: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop" },
        { sku: "SKU-PAPER-001", quantity: 2, title: "Premium Bilježnica A4 Libar (Lined)", img: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-001", quantity: 1, title: "Kemijska olovka Parker Jotter Premium (Blue)", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10104,
      customer_name: "Ana Jurić",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-BOOK-001", quantity: 1, title: "Mali Princ - Antoine de Saint-Exupéry", img: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-001", quantity: 1, title: "Kemijska olovka Parker Jotter Premium (Blue)", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-002", quantity: 1, title: "Set drvenih bojica Staedtler 24/1", img: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10105,
      customer_name: "Tomislav Filipović",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-BOOK-002", quantity: 1, title: "Harry Potter i Kamen Mudraca", img: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop" },
        { sku: "SKU-PAPER-001", quantity: 1, title: "Premium Bilježnica A4 Libar (Lined)", img: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=200&auto=format&fit=crop" },
        { sku: "SKU-GIFT-001", quantity: 1, title: "Keramička Šalica: 'Najbolji Picker na Svijetu'", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop" },
      ]
    },

    // --- Cluster 2: High gift / stationary overlaps (Expected to group in Batch 2) ---
    {
      woo_order_id: 10106,
      customer_name: "Petra Novak",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-GIFT-002", quantity: 1, title: "Ukrasna mirisna svijeća Lavanda Hvar", img: "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=200&auto=format&fit=crop" },
        { sku: "SKU-GIFT-003", quantity: 1, title: "Društvena igra 'Čovječe ne ljuti se' Drvena", img: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-002", quantity: 1, title: "Set drvenih bojica Staedtler 24/1", img: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10107,
      customer_name: "Josip Matić",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-GIFT-002", quantity: 2, title: "Ukrasna mirisna svijeća Lavanda Hvar", img: "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=200&auto=format&fit=crop" },
        { sku: "SKU-GIFT-003", quantity: 1, title: "Društvena igra 'Čovječe ne ljuti se' Drvena", img: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=200&auto=format&fit=crop" },
        { sku: "SKU-BOOK-003", quantity: 1, title: "Gospodar Prstenova: Prstenova Družina", img: "https://images.unsplash.com/photo-1621351183012-e2f9972dd9bf?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10108,
      customer_name: "Elena Radić",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-GIFT-003", quantity: 1, title: "Društvena igra 'Čovječe ne ljuti se' Drvena", img: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=200&auto=format&fit=crop" },
        { sku: "SKU-PAPER-002", quantity: 2, title: "Blok za skiciranje A3 Fabriano", img: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-002", quantity: 1, title: "Set drvenih bojica Staedtler 24/1", img: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10109,
      customer_name: "Karlo Pavlović",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-GIFT-001", quantity: 1, title: "Keramička Šalica: 'Najbolji Picker na Svijetu'", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop" },
        { sku: "SKU-GIFT-002", quantity: 1, title: "Ukrasna mirisna svijeća Lavanda Hvar", img: "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=200&auto=format&fit=crop" },
        { sku: "SKU-PAPER-002", quantity: 1, title: "Blok za skiciranje A3 Fabriano", img: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=200&auto=format&fit=crop" },
      ]
    },
    {
      woo_order_id: 10110,
      customer_name: "Lucija Grgić",
      status: "pending_batch",
      woo_status: "processing",
      items: [
        { sku: "SKU-GIFT-003", quantity: 1, title: "Društvena igra 'Čovječe ne ljuti se' Drvena", img: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=200&auto=format&fit=crop" },
        { sku: "SKU-GIFT-002", quantity: 1, title: "Ukrasna mirisna svijeća Lavanda Hvar", img: "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=200&auto=format&fit=crop" },
        { sku: "SKU-PEN-001", quantity: 1, title: "Kemijska olovka Parker Jotter Premium (Blue)", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=200&auto=format&fit=crop" },
      ]
    },
  ];

  for (const ord of ordersData) {
    // A. Insert single order
    const { data: newOrder, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        woo_order_id: ord.woo_order_id,
        customer_name: ord.customer_name,
        status: ord.status,
        woo_status: ord.woo_status,
      })
      .select()
      .single();

    if (oErr || !newOrder) {
      console.error(`❌ Failed to insert Order ${ord.woo_order_id}:`, oErr?.message || "Insert failed");
      continue;
    }

    // B. Insert nested items
    const nestedItems = ord.items.map(item => ({
      order_id: newOrder.id,
      sku: item.sku,
      quantity: item.quantity,
      product_title_snapshot: item.title,
      product_image_snapshot: item.img,
    }));

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(nestedItems);
    if (itemsErr) {
      console.error(`❌ Failed to insert items for Order ${ord.woo_order_id}:`, itemsErr.message);
    }
  }

  console.log("✅ Seeding completed! Database is fully populated with 10 pending, highly overlapping orders.");
  console.log("✨ You are ready to log in as 'admin@libar.hr' (pass: 'admin123') and test the smart batch algorithm!");
}

seed();
