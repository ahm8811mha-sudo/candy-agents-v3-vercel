import { getSupabaseAdmin } from "./supabase";

type SupplierInput = {
  name: string;
  category?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  rating?: number;
};

type InventoryInput = {
  sku: string;
  name: string;
  category?: string;
  unitCost?: number;
  targetPrice?: number;
  onHand?: number;
  reorderPoint?: number;
};

type PurchaseOrderInput = {
  supplierId?: string;
  title: string;
  total?: number;
  expectedDelivery?: string;
  items?: Array<Record<string, unknown>>;
};

type MovementInput = {
  itemId: string;
  movementType?: string;
  quantity: number;
  unitCost?: number;
  note?: string;
};

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function seedProcurementInventoryOS() {
  const supabase = requireSupabase();
  const { error: departmentError } = await supabase.from("departments").upsert(
    {
      id: "procurement",
      name: "إدارة المشتريات والمخزون",
      description: "إدارة الموردين، عروض الأسعار، أوامر الشراء، المخزون، تكلفة الوحدة، ونقاط إعادة الطلب.",
    },
    { onConflict: "id" }
  );
  if (departmentError) throw departmentError;

  const { error: costError } = await supabase.from("cost_centers").upsert(
    { id: "cc-procurement", name: "Procurement and Inventory", owner_role: "Procurement Manager", monthly_budget: 30000, status: "ACTIVE" },
    { onConflict: "id" }
  );
  if (costError) throw costError;
}

export async function getProcurementInventoryOS() {
  await seedProcurementInventoryOS();
  const supabase = requireSupabase();
  const [suppliers, quotes, orders, items, movements] = await Promise.all([
    supabase.from("suppliers").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("supplier_quotes").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_items").select("*").order("created_at", { ascending: false }).limit(150),
    supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(150),
  ]);

  for (const result of [suppliers, quotes, orders, items, movements]) {
    if (result.error) throw result.error;
  }

  const itemRows = items.data || [];
  const lowStock = itemRows.filter((item: any) => number(item.on_hand) <= number(item.reorder_point)).length;
  const inventoryValue = itemRows.reduce((sum: number, item: any) => sum + number(item.on_hand) * number(item.unit_cost), 0);
  const expectedMargin = itemRows.reduce((sum: number, item: any) => sum + Math.max(0, number(item.target_price) - number(item.unit_cost)) * number(item.on_hand), 0);
  const openOrders = (orders.data || []).filter((order: any) => !["RECEIVED", "CANCELLED"].includes(order.status));

  return {
    suppliers: suppliers.data || [],
    quotes: quotes.data || [],
    purchaseOrders: orders.data || [],
    items: itemRows,
    movements: movements.data || [],
    metrics: {
      suppliers: suppliers.data?.length || 0,
      items: itemRows.length,
      lowStock,
      inventoryValue,
      expectedMargin,
      openOrders: openOrders.length,
      openOrderValue: openOrders.reduce((sum: number, order: any) => sum + number(order.total), 0),
    },
    policy: [
      "لا يتم طلب مخزون جديد قبل معرفة تكلفة الوحدة والهامش المتوقع.",
      "أي صنف تحت حد إعادة الطلب يولد تنبيهًا تشغيليًا.",
      "كل مورد يحصل على تقييم جودة وسرعة وسعر قبل التوسع.",
      "أوامر الشراء الكبيرة تمر عبر CFO عند تجاوز الحد المالي.",
    ],
  };
}

export async function createSupplier(input: SupplierInput) {
  if (!input.name?.trim()) throw new Error("Supplier name is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("suppliers").insert({
    name: input.name.trim(),
    category: input.category || "general",
    contact_name: input.contactName || null,
    phone: input.phone || null,
    email: input.email || null,
    rating: number(input.rating) || 3,
    status: "ACTIVE",
  }).select().single();
  if (error) throw error;
  return data;
}

export async function createInventoryItem(input: InventoryInput) {
  if (!input.sku?.trim() || !input.name?.trim()) throw new Error("SKU and item name are required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("inventory_items").upsert(
    {
      sku: input.sku.trim(),
      name: input.name.trim(),
      category: input.category || "commerce",
      unit_cost: number(input.unitCost),
      target_price: number(input.targetPrice),
      on_hand: number(input.onHand),
      reorder_point: number(input.reorderPoint) || 5,
      status: "ACTIVE",
    },
    { onConflict: "sku" }
  ).select().single();
  if (error) throw error;
  return data;
}

export async function createPurchaseOrder(input: PurchaseOrderInput) {
  if (!input.title?.trim()) throw new Error("Purchase order title is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("purchase_orders").insert({
    supplier_id: input.supplierId || null,
    po_number: `PO-${Date.now()}`,
    title: input.title.trim(),
    status: "DRAFT",
    total: number(input.total),
    expected_delivery: input.expectedDelivery || null,
    items: input.items || [],
  }).select().single();
  if (error) throw error;
  return data;
}

export async function recordInventoryMovement(input: MovementInput) {
  if (!input.itemId) throw new Error("Inventory item is required.");
  const quantity = number(input.quantity);
  if (quantity === 0) throw new Error("Quantity cannot be zero.");
  const supabase = requireSupabase();
  const item = await supabase.from("inventory_items").select("*").eq("id", input.itemId).single();
  if (item.error) throw item.error;
  const movementType = input.movementType || "ADJUSTMENT";
  const delta = movementType === "OUT" ? -Math.abs(quantity) : Math.abs(quantity);
  const { data: movement, error } = await supabase.from("inventory_movements").insert({
    item_id: input.itemId,
    movement_type: movementType,
    quantity: delta,
    unit_cost: number(input.unitCost) || number(item.data.unit_cost),
    note: input.note || null,
  }).select().single();
  if (error) throw error;
  const updated = number(item.data.on_hand) + delta;
  const update = await supabase.from("inventory_items").update({ on_hand: updated, updated_at: new Date().toISOString() }).eq("id", input.itemId);
  if (update.error) throw update.error;
  return movement;
}
