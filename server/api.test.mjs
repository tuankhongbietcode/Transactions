import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.TEST_PORT || 8123);
const baseUrl = `http://127.0.0.1:${port}`;
const adminToken = "test-admin-token";

let server;
let dataDir;

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Server did not become healthy in time.");
}

async function json(response) {
  return response.json().catch(() => ({}));
}

async function createRegistration(body) {
  const response = await fetch(`${baseUrl}/api/registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await json(response) };
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "event-payment-test-"));

  server = spawn(process.execPath, [path.join(rootDir, "server", "index.mjs")], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_TOKEN: adminToken,
      PUBLIC_BASE_URL: baseUrl,
      PAYOS_CLIENT_ID: "",
      PAYOS_API_KEY: "",
      PAYOS_CHECKSUM_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: "ignore",
  });

  await waitForHealth();
});

after(async () => {
  server?.kill();
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

test("health endpoint reports file storage when Supabase is not configured", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);

  const body = await json(response);
  assert.equal(body.ok, true);
  assert.equal(body.storage, "file");
  assert.equal(body.payosConfigured, false);
});

test("security headers are set and X-Powered-By is removed", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("free registration is confirmed immediately and returns a ticket id", async () => {
  const { status, body } = await createRegistration({
    planId: "free",
    fullName: "Nguyen Van A",
    email: "a@example.com",
    phone: "0901234567",
    company: "ACME",
  });

  assert.equal(status, 201);
  assert.match(body.registration.id, /^EVT-FRE-\d{6}-[0-9A-F]{6}$/);
  assert.equal(body.registration.status, "confirmed");
  assert.equal(body.registration.amount, 0);
  assert.equal(body.registration.paymentProvider, "free");
});

test("paid registration returns a mock checkout link when payOS is not configured", async () => {
  const { status, body } = await createRegistration({
    planId: "standard",
    fullName: "Tran Thi B",
    email: "b@example.com",
    phone: "0907654321",
  });

  assert.equal(status, 201);
  assert.equal(body.registration.status, "payment_pending");
  assert.equal(body.registration.amount, 10000);
  assert.equal(body.registration.paymentProvider, "mock");
  assert.match(body.registration.paymentUrl, /\/mock-checkout\//);
});

test("invalid plan and missing fields are rejected", async () => {
  const unknownPlan = await createRegistration({
    planId: "gold",
    fullName: "X",
    email: "x@y.z",
    phone: "0900000000",
  });
  assert.equal(unknownPlan.status, 400);

  const missingFields = await createRegistration({ planId: "free" });
  assert.equal(missingFields.status, 400);
});

test("staff endpoints reject missing and wrong admin tokens", async () => {
  const exportWithoutToken = await fetch(`${baseUrl}/api/export/registrations.xlsx`);
  assert.equal(exportWithoutToken.status, 401);

  const exportWithWrongToken = await fetch(`${baseUrl}/api/export/registrations.xlsx`, {
    headers: { Authorization: "Bearer not-the-token" },
  });
  assert.equal(exportWithWrongToken.status, 401);

  const emailTest = await fetch(`${baseUrl}/api/email/test`, { method: "POST" });
  assert.equal(emailTest.status, 401);
});

test("staff export works with the admin token", async () => {
  const response = await fetch(`${baseUrl}/api/export/registrations.xlsx`, {
    headers: { "X-Admin-Token": adminToken },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /spreadsheetml/);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 0);
});

test("check-in lookup is public but confirming requires the admin token", async () => {
  const { body } = await createRegistration({
    planId: "free",
    fullName: "Le Van C",
    email: "c@example.com",
    phone: "0901112223",
  });
  const id = body.registration.id;

  const lookup = await fetch(`${baseUrl}/api/checkin/${id}`);
  assert.equal(lookup.status, 200);

  const forbidden = await fetch(`${baseUrl}/api/checkin/${id}/confirm`, { method: "POST" });
  assert.equal(forbidden.status, 401);

  const confirmed = await fetch(`${baseUrl}/api/checkin/${id}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(confirmed.status, 200);
  const confirmedBody = await json(confirmed);
  assert.ok(confirmedBody.registration.checkedInAt);

  const duplicate = await fetch(`${baseUrl}/api/checkin/${id}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(duplicate.status, 409);
});

test("payOS webhook is refused while payOS is not configured", async () => {
  const response = await fetch(`${baseUrl}/api/payos/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "00",
      data: { orderCode: 123 },
      signature: "fake",
      success: true,
    }),
  });

  assert.equal(response.status, 503);
});

test("mock payment requires the admin token", async () => {
  const { body } = await createRegistration({
    planId: "mastery",
    fullName: "Pham Thi D",
    email: "d@example.com",
    phone: "0903334445",
  });
  const id = body.registration.id;

  const forbidden = await fetch(`${baseUrl}/api/mock/pay/${id}`, { method: "POST" });
  assert.equal(forbidden.status, 401);

  const paid = await fetch(`${baseUrl}/api/mock/pay/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(paid.status, 200);
  const paidBody = await json(paid);
  assert.equal(paidBody.registration.status, "confirmed");
});
