import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import express from "express";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const dataDir = path.join(rootDir, "data");
const dataFile = path.join(dataDir, "registrations.json");
const excelFile = path.join(dataDir, "registrations.xlsx");

const app = express();
const port = Number(process.env.PORT || 8080);
let storeQueue = Promise.resolve();
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

const plans = {
  free: { id: "free", name: "Free", amount: 0 },
  standard: { id: "standard", name: "Standard", amount: 10000 },
  mastery: { id: "mastery", name: "Mastery", amount: 20000 },
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ registrations: [] }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const backupFile = path.join(dataDir, `registrations.corrupt-${Date.now()}.json`);
    await fs.rename(dataFile, backupFile);
    await fs.writeFile(dataFile, JSON.stringify({ registrations: [] }, null, 2));
    console.error(`Registration store was corrupt. Backed it up to ${backupFile}.`, error);
    return { registrations: [] };
  }
}

async function writeStore(store) {
  await ensureStore();
  const tempFile = path.join(dataDir, `registrations.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempFile, JSON.stringify(store, null, 2));
  await fs.rename(tempFile, dataFile);
}

function toExcelDate(value) {
  return value ? new Date(value) : null;
}

async function writeRegistrationsExcel(store) {
  await ensureStore();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Event Payment Registration";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Registrations", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Mã vé", key: "id", width: 24 },
    { header: "Mã đơn payOS", key: "orderCode", width: 16 },
    { header: "Họ tên", key: "fullName", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Số điện thoại", key: "phone", width: 16 },
    { header: "Công ty", key: "company", width: 22 },
    { header: "Hạng vé", key: "planName", width: 14 },
    { header: "Số tiền", key: "amount", width: 14 },
    { header: "Trạng thái", key: "status", width: 18 },
    { header: "Cổng thanh toán", key: "paymentProvider", width: 16 },
    { header: "Ngày đăng ký", key: "createdAt", width: 22 },
    { header: "Ngày thanh toán", key: "paidAt", width: 22 },
    { header: "Ngày check-in", key: "checkedInAt", width: 22 },
    { header: "Link thanh toán", key: "paymentUrl", width: 42 },
  ];

  const rows = [...store.registrations].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const registration of rows) {
    sheet.addRow({
      id: registration.id,
      orderCode: registration.orderCode,
      fullName: registration.fullName,
      email: registration.email,
      phone: registration.phone,
      company: registration.company,
      planName: registration.planName,
      amount: registration.amount,
      status: registration.checkedInAt ? "checked_in" : registration.status,
      paymentProvider: registration.paymentProvider,
      createdAt: toExcelDate(registration.createdAt),
      paidAt: toExcelDate(registration.paidAt),
      checkedInAt: toExcelDate(registration.checkedInAt),
      paymentUrl: registration.paymentUrl,
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 24;

  sheet.getColumn("amount").numFmt = '#,##0 "VND"';
  for (const key of ["createdAt", "paidAt", "checkedInAt"]) {
    sheet.getColumn(key).numFmt = "dd/mm/yyyy hh:mm";
  }

  sheet.autoFilter = {
    from: "A1",
    to: "N1",
  };

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "middle", wrapText: rowNumber > 1 };
    });
  });

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { width: 28 },
    { width: 18 },
  ];
  summary.addRows([
    ["Chỉ số", "Giá trị"],
    ["Tổng đăng ký", rows.length],
    ["Đã thanh toán/xác nhận", rows.filter((item) => item.status === "confirmed").length],
    ["Đã check-in", rows.filter((item) => item.checkedInAt).length],
    ["Standard", rows.filter((item) => item.planId === "standard").length],
    ["Mastery", rows.filter((item) => item.planId === "mastery").length],
    ["Free", rows.filter((item) => item.planId === "free").length],
    ["Doanh thu xác nhận", rows.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0)],
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF182230" } };
  summary.getColumn(2).numFmt = '#,##0';
  summary.getCell("B8").numFmt = '#,##0 "VND"';

  await workbook.xlsx.writeFile(excelFile);
}

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

function fromDbRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderCode: row.order_code,
    planId: row.plan_id,
    planName: row.plan_name,
    amount: row.amount,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company || "",
    paymentProvider: row.payment_provider,
    paymentUrl: row.payment_url,
    paymentQr: row.payment_qr,
    paymentLinkId: row.payment_link_id,
    payosStatus: row.payos_status,
    amountPaid: row.amount_paid,
    amountRemaining: row.amount_remaining,
    paymentReference: row.payment_reference,
    transactions: row.transactions,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    checkedInAt: row.checked_in_at,
  };
}

async function readAllRegistrations() {
  if (!supabase) return readStore();

  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return { registrations: data.map(fromDbRegistration) };
}

async function updateStore(updater) {
  const task = storeQueue.then(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    await writeRegistrationsExcel(store);
    return result;
  });
  storeQueue = task.catch(() => undefined);
  return task;
}

async function saveRegistration(registration) {
  if (supabase) {
    const { data, error } = await supabase
      .from("registrations")
      .upsert(toDbRegistration(registration), { onConflict: "id" })
      .select()
      .single();

    if (error) throw error;
    const savedRegistration = fromDbRegistration(data);
    await writeRegistrationsExcel(await readAllRegistrations());
    return savedRegistration;
  }

  return updateStore((store) => {
    const index = store.registrations.findIndex((item) => item.id === registration.id);
    if (index >= 0) {
      store.registrations[index] = registration;
    } else {
      store.registrations.push(registration);
    }
    return registration;
  });
}

async function findRegistrationById(id) {
  if (supabase) {
    const { data, error } = await supabase.from("registrations").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return fromDbRegistration(data);
  }

  const store = await readStore();
  return store.registrations.find((item) => item.id === id);
}

async function findRegistrationByOrderCode(orderCode) {
  if (supabase) {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("order_code", Number(orderCode))
      .maybeSingle();
    if (error) throw error;
    return fromDbRegistration(data);
  }

  const store = await readStore();
  return store.registrations.find((item) => String(item.orderCode) === String(orderCode));
}

function makeRegistrationId(planId) {
  const planPrefix = planId.toUpperCase().slice(0, 3);
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EVT-${planPrefix}-${Date.now().toString().slice(-6)}-${random}`;
}

function makeOrderCode() {
  return Number(`${Date.now().toString().slice(-8)}${crypto.randomInt(10, 99)}`);
}

function configuredPayOS() {
  return Boolean(
    process.env.PAYOS_CLIENT_ID &&
      process.env.PAYOS_API_KEY &&
      process.env.PAYOS_CHECKSUM_KEY,
  );
}

function hmacSha256(data, key) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

function createPayOSSignature(payload) {
  const signatureData = `amount=${payload.amount}&cancelUrl=${payload.cancelUrl}&description=${payload.description}&orderCode=${payload.orderCode}&returnUrl=${payload.returnUrl}`;
  return hmacSha256(signatureData, process.env.PAYOS_CHECKSUM_KEY || "");
}

function createWebhookSignature(data) {
  const signatureData = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("&");
  return hmacSha256(signatureData, process.env.PAYOS_CHECKSUM_KEY || "");
}

function isPaidPaymentStatus(paymentData, registration) {
  return (
    paymentData.status === "PAID" ||
    paymentData.status === "SUCCEEDED" ||
    paymentData.status === "SUCCESS" ||
    paymentData.amountRemaining === 0 ||
    paymentData.amountPaid >= registration.amount
  );
}

async function getPayOSPaymentRequest(registration) {
  const id = registration.paymentLinkId || registration.orderCode;
  const response = await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": process.env.PAYOS_CLIENT_ID,
      "x-api-key": process.env.PAYOS_API_KEY,
    },
  });

  const result = await response.json();
  if (!response.ok || result.code !== "00") {
    throw new Error(result.desc || "Khong the kiem tra trang thai payOS.");
  }
  return result.data;
}

async function refreshPaymentStatus(registration) {
  if (
    !configuredPayOS() ||
    !registration ||
    registration.paymentProvider !== "payos" ||
    registration.status === "confirmed"
  ) {
    return registration;
  }

  const paymentData = await getPayOSPaymentRequest(registration);
  registration.payosStatus = paymentData.status;
  registration.amountPaid = paymentData.amountPaid;
  registration.amountRemaining = paymentData.amountRemaining;
  registration.transactions = paymentData.transactions;

  if (isPaidPaymentStatus(paymentData, registration)) {
    registration.status = "confirmed";
    registration.paidAt = new Date().toISOString();
  }

  await saveRegistration(registration);
  return registration;
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

async function createPayOSPaymentLink(req, registration) {
  const baseUrl = publicBaseUrl(req);
  const description = `EVT${registration.orderCode}`;
  const payload = {
    orderCode: registration.orderCode,
    amount: registration.amount,
    description,
    buyerName: registration.fullName,
    buyerEmail: registration.email,
    buyerPhone: registration.phone,
    items: [
      {
        name: `Event ${registration.planName}`,
        quantity: 1,
        price: registration.amount,
      },
    ],
    cancelUrl: `${baseUrl}/?order=${registration.id}&payment=cancelled`,
    returnUrl: `${baseUrl}/?order=${registration.id}&payment=return`,
  };
  payload.signature = createPayOSSignature(payload);

  const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": process.env.PAYOS_CLIENT_ID,
      "x-api-key": process.env.PAYOS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || result.code !== "00") {
    throw new Error(result.desc || "payOS payment link creation failed");
  }

  return {
    provider: "payos",
    paymentUrl: result.data.checkoutUrl,
    paymentQr: result.data.qrCode,
    paymentLinkId: result.data.paymentLinkId,
  };
}

function createMockPayment(req, registration) {
  const baseUrl = publicBaseUrl(req);
  return {
    provider: "mock",
    paymentUrl: `${baseUrl}/mock-checkout/${registration.id}`,
    paymentQr: JSON.stringify({
      type: "mock-payment",
      registrationId: registration.id,
      amount: registration.amount,
      url: `${baseUrl}/mock-checkout/${registration.id}`,
    }),
    paymentLinkId: `mock_${registration.orderCode}`,
  };
}

function cleanRegistration(registration) {
  return {
    id: registration.id,
    orderCode: registration.orderCode,
    planId: registration.planId,
    planName: registration.planName,
    amount: registration.amount,
    status: registration.status,
    fullName: registration.fullName,
    email: registration.email,
    phone: registration.phone,
    company: registration.company,
    paymentProvider: registration.paymentProvider,
    paymentUrl: registration.paymentUrl,
    paymentQr: registration.paymentQr,
    createdAt: registration.createdAt,
    paidAt: registration.paidAt,
    payosStatus: registration.payosStatus,
    amountPaid: registration.amountPaid,
    amountRemaining: registration.amountRemaining,
    checkedInAt: registration.checkedInAt,
  };
}

function cleanCheckInRegistration(registration) {
  return {
    id: registration.id,
    orderCode: registration.orderCode,
    planId: registration.planId,
    planName: registration.planName,
    amount: registration.amount,
    status: registration.status,
    fullName: registration.fullName,
    email: registration.email,
    phone: registration.phone,
    company: registration.company,
    paidAt: registration.paidAt,
    checkedInAt: registration.checkedInAt,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, payosConfigured: configuredPayOS(), storage: supabase ? "supabase" : "file" });
});

app.get("/api/export/registrations.xlsx", async (_req, res) => {
  try {
    const store = await readAllRegistrations();
    await writeRegistrationsExcel(store);
    res.download(excelFile, "event-registrations.xlsx");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the tao file Excel." });
  }
});

app.post("/api/registrations", async (req, res) => {
  try {
    const { planId, fullName, email, phone, company } = req.body;
    const plan = plans[planId];

    if (!plan) return res.status(400).json({ message: "Gói vé không hợp lệ." });
    if (!fullName || !email || !phone) {
      return res.status(400).json({ message: "Vui lòng nhập đủ họ tên, email và số điện thoại." });
    }

    let registration = {
      id: makeRegistrationId(plan.id),
      orderCode: makeOrderCode(),
      planId: plan.id,
      planName: plan.name,
      amount: plan.amount,
      status: plan.amount === 0 ? "confirmed" : "payment_pending",
      fullName: String(fullName).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      company: String(company || "").trim(),
      paymentProvider: plan.amount === 0 ? "free" : null,
      paymentUrl: null,
      paymentQr: null,
      paymentLinkId: null,
      createdAt: new Date().toISOString(),
      paidAt: plan.amount === 0 ? new Date().toISOString() : null,
    };

    if (plan.amount > 0) {
      const payment = configuredPayOS()
        ? await createPayOSPaymentLink(req, registration)
        : createMockPayment(req, registration);

      registration = {
        ...registration,
        paymentProvider: payment.provider,
        paymentUrl: payment.paymentUrl,
        paymentQr: payment.paymentQr,
        paymentLinkId: payment.paymentLinkId,
      };
    }

    await saveRegistration(registration);
    res.status(201).json({ registration: cleanRegistration(registration) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Không thể tạo đăng ký." });
  }
});

app.get("/api/registrations/by-order/:orderCode", async (req, res) => {
  try {
    const registration = await findRegistrationByOrderCode(req.params.orderCode);
    if (!registration) return res.status(404).json({ message: "Khong tim thay don." });
    const refreshedRegistration = await refreshPaymentStatus(registration);
    res.json({ registration: cleanRegistration(refreshedRegistration) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Khong the kiem tra trang thai." });
  }
});

app.get("/api/registrations/:id", async (req, res) => {
  const registration = await findRegistrationById(req.params.id);
  if (!registration) return res.status(404).json({ message: "Không tìm thấy đăng ký." });
  const refreshedRegistration = await refreshPaymentStatus(registration);
  res.json({ registration: cleanRegistration(refreshedRegistration) });
});

app.post("/api/mock/pay/:id", async (req, res) => {
  const registration = await findRegistrationById(req.params.id);
  if (!registration) return res.status(404).json({ message: "Không tìm thấy đăng ký." });
  if (registration.paymentProvider !== "mock") {
    return res.status(400).json({ message: "Đăng ký này không dùng mock payment." });
  }

  registration.status = "confirmed";
  registration.paidAt = new Date().toISOString();
  await saveRegistration(registration);
  res.json({ registration: cleanRegistration(registration) });
});

app.get("/api/checkin/:id", async (req, res) => {
  try {
    let registration = await findRegistrationById(req.params.id);
    if (!registration) return res.status(404).json({ message: "Khong tim thay ve." });
    registration = await refreshPaymentStatus(registration);
    res.json({ registration: cleanCheckInRegistration(registration) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Khong the kiem tra ve." });
  }
});

app.post("/api/checkin/:id/confirm", async (req, res) => {
  try {
    const registration = await findRegistrationById(req.params.id);
    if (!registration) return res.status(404).json({ message: "Khong tim thay ve." });

    const refreshedRegistration = await refreshPaymentStatus(registration);
    if (refreshedRegistration.status !== "confirmed") {
      return res.status(400).json({ message: "Ve nay chua duoc xac nhan thanh toan." });
    }
    if (refreshedRegistration.checkedInAt) {
      return res.status(409).json({
        message: "Ve nay da check-in truoc do.",
        registration: cleanCheckInRegistration(refreshedRegistration),
      });
    }

    refreshedRegistration.checkedInAt = new Date().toISOString();
    await saveRegistration(refreshedRegistration);
    res.json({ registration: cleanCheckInRegistration(refreshedRegistration) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Khong the check-in." });
  }
});

app.post("/api/payos/webhook", async (req, res) => {
  try {
    const { code, data, signature, success } = req.body;
    if (!data || !signature) return res.status(400).json({ message: "Webhook thiếu dữ liệu." });

    if (configuredPayOS()) {
      const expected = createWebhookSignature(data);
      if (expected !== signature) return res.status(401).json({ message: "Sai chữ ký webhook." });
    }

    const registration = await findRegistrationByOrderCode(data.orderCode);
    if (!registration) return res.status(404).json({ message: "Không tìm thấy đơn." });

    if (success && code === "00") {
      registration.status = "confirmed";
      registration.paidAt = new Date().toISOString();
      registration.paymentReference = data.reference;
      await saveRegistration(registration);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Không thể xử lý webhook." });
  }
});

app.get("/mock-checkout/:id", async (req, res) => {
  const registration = await findRegistrationById(req.params.id);
  if (!registration) return res.status(404).send("Không tìm thấy đăng ký.");

  res.type("html").send(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mock checkout</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f5f7fb; color: #182230; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    section { width: min(460px, 100%); background: white; border: 1px solid #dbe3ef; border-radius: 8px; padding: 28px; box-shadow: 0 18px 50px rgba(16,24,40,.08); }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    p { color: #556070; line-height: 1.6; }
    strong { display: block; margin: 20px 0; font-size: 2rem; color: #b54708; }
    button, a { min-height: 46px; border-radius: 8px; border: 0; padding: 0 16px; font-weight: 800; cursor: pointer; }
    button { width: 100%; background: #0f766e; color: white; }
    a { display: inline-grid; place-items: center; margin-top: 12px; color: #182230; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Mock payment</h1>
      <p>Trang này dùng để test khi chưa cấu hình payOS. Bấm nút dưới để giả lập thanh toán thành công.</p>
      <p>${registration.fullName} - ${registration.planName}</p>
      <strong>${registration.amount.toLocaleString("vi-VN")} VND</strong>
      <button id="pay">Thanh toán thành công</button>
      <a href="/?order=${registration.id}">Quay lại đăng ký</a>
    </section>
  </main>
  <script>
    document.getElementById("pay").addEventListener("click", async () => {
      await fetch("/api/mock/pay/${registration.id}", { method: "POST" });
      window.location.href = "/?order=${registration.id}&payment=success";
    });
  </script>
</body>
</html>`);
});

app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Payment app listening at http://127.0.0.1:${port}`);
});
