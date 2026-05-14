import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataFile = path.join(rootDir, "data", "registrations.json");

function toDbRegistration(registration) {
  return {
    id: registration.id,
    order_code: registration.orderCode,
    plan_id: registration.planId,
    plan_name: registration.planName,
    amount: registration.amount,
    status: registration.status,
    full_name: registration.fullName,
    email: registration.email,
    phone: registration.phone,
    company: registration.company,
    payment_provider: registration.paymentProvider,
    payment_url: registration.paymentUrl,
    payment_qr: registration.paymentQr,
    payment_link_id: registration.paymentLinkId,
    payos_status: registration.payosStatus,
    amount_paid: registration.amountPaid,
    amount_remaining: registration.amountRemaining,
    payment_reference: registration.paymentReference,
    transactions: registration.transactions,
    created_at: registration.createdAt,
    paid_at: registration.paidAt,
    checked_in_at: registration.checkedInAt,
    updated_at: new Date().toISOString(),
  };
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const raw = await fs.readFile(dataFile, "utf8");
const store = JSON.parse(raw);
const rows = store.registrations.map(toDbRegistration);

if (rows.length === 0) {
  console.log("No local registrations to migrate.");
} else {
  const { error } = await supabase.from("registrations").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  console.log(`Migrated ${rows.length} registrations to Supabase.`);
}
