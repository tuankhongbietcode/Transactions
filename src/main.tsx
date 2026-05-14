import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sheet,
  Sparkles,
  Ticket,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./styles.css";

type PlanId = "free" | "standard" | "mastery";
type RegistrationStatus = "confirmed" | "payment_pending";

type Plan = {
  id: PlanId;
  name: string;
  price: number;
  label: string;
  features: string[];
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
};

type Registration = FormState & {
  id: string;
  orderCode: number;
  planId: PlanId;
  planName: string;
  amount: number;
  status: RegistrationStatus;
  paymentProvider: "free" | "mock" | "payos" | null;
  paymentUrl: string | null;
  paymentQr: string | null;
  createdAt: string;
  paidAt?: string | null;
  checkedInAt?: string | null;
};

type CheckInRegistration = {
  id: string;
  orderCode: number;
  planId: PlanId;
  planName: string;
  amount: number;
  status: RegistrationStatus;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  paidAt?: string | null;
  checkedInAt?: string | null;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    label: "Đăng ký nhanh",
    features: ["Form thông tin cá nhân", "QR check-in xuất ngay", "Phù hợp khách tham dự tự do"],
  },
  {
    id: "standard",
    name: "Standard",
    price: 10000,
    label: "Vé tiêu chuẩn",
    features: ["Xác nhận sau thanh toán", "QR check-in theo mã đơn", "Hỗ trợ đối soát tại cổng"],
  },
  {
    id: "mastery",
    name: "Mastery",
    price: 20000,
    label: "Trải nghiệm đầy đủ",
    features: ["Ưu tiên xác nhận", "QR check-in riêng", "Thông tin vé đầy đủ để hậu kiểm"],
  },
];

const initialForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
};

function formatPrice(price: number) {
  if (price === 0) return "0";
  return `${price.toLocaleString("vi-VN")} VND`;
}

async function parseApiResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Có lỗi xảy ra, vui lòng thử lại.");
  return body;
}

function App() {
  const isCheckInPage = window.location.pathname === "/checkin";
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("free");
  const [form, setForm] = useState<FormState>(initialForm);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0],
    [selectedPlanId],
  );

  const checkInPayload = useMemo(() => {
    if (!registration) return "";
    return `${window.location.origin}/checkin?id=${encodeURIComponent(registration.id)}`;
  }, [registration]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planFromUrl = params.get("plan");
    if (planFromUrl === "free" || planFromUrl === "standard" || planFromUrl === "mastery") {
      setSelectedPlanId(planFromUrl);
    }

    const orderId = params.get("order");
    const orderCode = params.get("orderCode");
    if (orderId) {
      fetchRegistration(orderId).catch((error) => setNotice(error.message));
      return;
    }
    if (orderCode) {
      fetchRegistrationByOrderCode(orderCode).catch((error) => setNotice(error.message));
    }
  }, []);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validateForm() {
    const nextErrors: Partial<FormState> = {};
    if (!form.fullName.trim()) nextErrors.fullName = "Vui lòng nhập họ tên";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Email chưa hợp lệ";
    }
    if (!/^[0-9+\s().-]{8,16}$/.test(form.phone.trim())) {
      nextErrors.phone = "Số điện thoại chưa hợp lệ";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function fetchRegistration(id: string) {
    setIsRefreshing(true);
    try {
      const body = await parseApiResponse(await fetch(`/api/registrations/${id}`));
      setRegistration(body.registration);
      setSelectedPlanId(body.registration.planId);
      setForm({
        fullName: body.registration.fullName,
        email: body.registration.email,
        phone: body.registration.phone,
        company: body.registration.company || "",
      });
      setNotice("");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function fetchRegistrationByOrderCode(orderCode: string) {
    setIsRefreshing(true);
    try {
      const body = await parseApiResponse(await fetch(`/api/registrations/by-order/${orderCode}`));
      setRegistration(body.registration);
      setSelectedPlanId(body.registration.planId);
      setForm({
        fullName: body.registration.fullName,
        email: body.registration.email,
        phone: body.registration.phone,
        company: body.registration.company || "",
      });
      setNotice("");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setNotice("");

    try {
      const body = await parseApiResponse(
        await fetch("/api/registrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, planId: selectedPlan.id }),
        }),
      );
      setRegistration(body.registration);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo đăng ký.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!registration) return;
    await fetchRegistration(registration.id);
  }

  function resetFlow() {
    setForm(initialForm);
    setRegistration(null);
    setErrors({});
    setNotice("");
    setSelectedPlanId("free");
    window.history.replaceState({}, "", "/");
  }

  if (isCheckInPage) {
    return <CheckInApp />;
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="intro-panel">
          <div className="event-badge">
            <Sparkles size={16} />
            Event registration
          </div>
          <h1>Đăng ký vé và xuất QR check-in</h1>
          <p>
            Free xuất QR ngay sau form. Standard và Mastery tạo đơn thanh toán thật qua server,
            sau khi webhook xác nhận thì QR check-in chuyển sang trạng thái hợp lệ.
          </p>
          <div className="summary-strip">
            <span>
              <Ticket size={18} /> 3 gói vé
            </span>
            <span>
              <ShieldCheck size={18} /> Webhook xác nhận
            </span>
          </div>
        </div>

        {notice && <div className="notice">{notice}</div>}

        <div className="flow-grid">
          <section className="plan-section" aria-label="Chọn gói vé">
            <div className="section-heading">
              <span>01</span>
              <h2>Chọn hạng mục</h2>
            </div>
            <div className="plans">
              {plans.map((plan) => (
                <button
                  className={`plan-card ${selectedPlanId === plan.id ? "selected" : ""}`}
                  key={plan.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setRegistration(null);
                    setNotice("");
                  }}
                >
                  <span className="plan-topline">{plan.label}</span>
                  <strong>{plan.name}</strong>
                  <span className="price">{formatPrice(plan.price)}</span>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={15} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </section>

          <section className="form-section" aria-label="Form thông tin cá nhân">
            <div className="section-heading">
              <span>02</span>
              <h2>Thông tin cá nhân</h2>
            </div>
            <form onSubmit={submitRegistration} noValidate>
              <label>
                Họ và tên
                <input
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  placeholder="Nguyễn Văn A"
                />
                {errors.fullName && <small>{errors.fullName}</small>}
              </label>
              <label>
                Email
                <input
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@example.com"
                  inputMode="email"
                />
                {errors.email && <small>{errors.email}</small>}
              </label>
              <label>
                Số điện thoại
                <input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="0901234567"
                  inputMode="tel"
                />
                {errors.phone && <small>{errors.phone}</small>}
              </label>
              <label>
                Công ty / tổ chức
                <input
                  value={form.company}
                  onChange={(event) => updateField("company", event.target.value)}
                  placeholder="Tên đơn vị"
                />
              </label>
              <button className="primary-action" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="spin" size={18} /> : <QrCode size={18} />}
                {selectedPlan.price === 0 ? "Tạo QR check-in" : "Tạo đơn thanh toán"}
              </button>
            </form>
          </section>

          <section className="result-section" aria-label="Kết quả đăng ký">
            <div className="section-heading">
              <span>03</span>
              <h2>Xác nhận</h2>
            </div>

            {!registration && (
              <div className="empty-state">
                <QrCode size={34} />
                <p>QR sẽ xuất hiện ở đây sau khi khách hoàn tất form.</p>
              </div>
            )}

            {registration && registration.status === "payment_pending" && (
              <div className="ticket-panel">
                <div className="status-pill pending">
                  <CreditCard size={16} />
                  Chờ thanh toán
                </div>
                <h3>{registration.planName}</h3>
                <p className="registration-id">{registration.id}</p>
                <div className="qr-frame">
                  <QRCodeSVG value={registration.paymentQr || registration.paymentUrl || ""} size={184} level="M" includeMargin />
                </div>
                <dl>
                  <div>
                    <dt>Số tiền</dt>
                    <dd>{formatPrice(registration.amount)}</dd>
                  </div>
                  <div>
                    <dt>Mã đơn</dt>
                    <dd>{registration.orderCode}</dd>
                  </div>
                  <div>
                    <dt>Cổng</dt>
                    <dd>{registration.paymentProvider === "payos" ? "payOS" : "Mock"}</dd>
                  </div>
                </dl>
                {registration.paymentUrl && (
                  <a className="secondary-action link-action" href={registration.paymentUrl}>
                    <ExternalLink size={17} />
                    Mở trang thanh toán
                  </a>
                )}
                <button className="ghost-action" type="button" onClick={refreshStatus} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                  Kiểm tra trạng thái
                </button>
              </div>
            )}

            {registration && registration.status === "confirmed" && (
              <div className="ticket-panel confirmed">
                <div className="status-pill">
                  <ShieldCheck size={16} />
                  Đã xác nhận
                </div>
                <h3>{registration.fullName}</h3>
                <p className="registration-id">{registration.id}</p>
                <div className="qr-frame">
                  <QRCodeSVG value={checkInPayload} size={184} level="M" includeMargin />
                </div>
                <dl>
                  <div>
                    <dt>Gói vé</dt>
                    <dd>{registration.planName}</dd>
                  </div>
                  <div>
                    <dt>Điện thoại</dt>
                    <dd>{registration.phone}</dd>
                  </div>
                </dl>
                <button className="secondary-action" type="button" onClick={resetFlow}>
                  Tạo đăng ký mới
                </button>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

function extractTicketLookup(value: string): { type: "id" | "orderCode"; value: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.registrationId) return { type: "id", value: String(parsed.registrationId) };
    if (parsed.orderCode) return { type: "orderCode", value: String(parsed.orderCode) };
  } catch {
    // Plain code or URL is expected for staff check-in.
  }

  try {
    const parsedUrl = new URL(trimmed);
    const id = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("order");
    if (id) return { type: "id", value: id };

    const orderCode = parsedUrl.searchParams.get("orderCode");
    if (orderCode) return { type: "orderCode", value: orderCode };
  } catch {
    // Continue with text extraction below.
  }

  const registrationMatch = trimmed.match(/EVT-[A-Z]{3}-\d{6}-[A-Z0-9]{6}/i);
  if (registrationMatch) return { type: "id", value: registrationMatch[0].toUpperCase() };

  const compactOrderMatch = trimmed.match(/\bEVT\s*([0-9]{8,12})\b/i);
  if (compactOrderMatch) return { type: "orderCode", value: compactOrderMatch[1] };

  const plainOrderMatch = trimmed.match(/\b[0-9]{8,12}\b/);
  if (plainOrderMatch) return { type: "orderCode", value: plainOrderMatch[0] };

  return { type: "id", value: trimmed };
}

function CheckInApp() {
  const params = new URLSearchParams(window.location.search);
  const initialId = params.get("id") || params.get("order") || "";
  const [ticketCode, setTicketCode] = useState(initialId);
  const [registration, setRegistration] = useState<CheckInRegistration | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialId) {
      lookupTicket(initialId).catch((error) => setMessage(error.message));
    }
  }, []);

  async function lookupTicket(code = ticketCode) {
    const lookup = extractTicketLookup(code);
    if (!lookup) {
      setMessage("Nhập mã vé hoặc scan QR trước.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const endpoint =
        lookup.type === "orderCode"
          ? `/api/checkin/by-order/${encodeURIComponent(lookup.value)}`
          : `/api/checkin/${encodeURIComponent(lookup.value)}`;
      const body = await parseApiResponse(await fetch(endpoint));
      setRegistration(body.registration);
      setTicketCode(body.registration.id);
    } catch (error) {
      setRegistration(null);
      setMessage(error instanceof Error ? error.message : "Không thể kiểm tra vé.");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmCheckIn() {
    if (!registration) return;
    setIsLoading(true);
    setMessage("");

    try {
      const body = await parseApiResponse(
        await fetch(`/api/checkin/${encodeURIComponent(registration.id)}/confirm`, {
          method: "POST",
        }),
      );
      setRegistration(body.registration);
      setMessage("Check-in thành công.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể check-in.");
      await lookupTicket(registration.id);
    } finally {
      setIsLoading(false);
    }
  }

  const canCheckIn = registration?.status === "confirmed" && !registration.checkedInAt;

  return (
    <main className="page-shell checkin-shell">
      <section className="workspace checkin-workspace">
        <div className="intro-panel">
          <div className="event-badge">
            <ShieldCheck size={16} />
            Staff check-in
          </div>
          <h1>Kiểm tra vé sự kiện</h1>
          <p>Scan QR của khách hoặc nhập mã vé để xem tên, hạng vé và trạng thái check-in.</p>
        </div>

        <section className="checkin-grid">
          <div className="staff-panel">
            <label>
              Mã vé / nội dung QR
              <textarea
                value={ticketCode}
                onChange={(event) => setTicketCode(event.target.value)}
                placeholder="EVT-STA-624505-E62EA9 hoặc dán nội dung QR"
              />
            </label>
            <button className="primary-action" type="button" onClick={() => lookupTicket()} disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <QrCode size={18} />}
              Kiểm tra vé
            </button>
            <a className="ghost-action export-link" href="/api/export/registrations.xlsx">
              <Sheet size={16} />
              Tải danh sách Excel
            </a>
            {message && <div className="notice compact">{message}</div>}
          </div>

          <div className="staff-result">
            {!registration && (
              <div className="empty-state">
                <QrCode size={34} />
                <p>Thông tin khách sẽ hiện ở đây sau khi scan hoặc nhập mã.</p>
              </div>
            )}

            {registration && (
              <div className={`ticket-panel ${registration.checkedInAt ? "checked-in" : ""}`}>
                <div
                  className={`status-pill ${
                    registration.status === "confirmed" && !registration.checkedInAt ? "" : "pending"
                  }`}
                >
                  {registration.checkedInAt ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
                  {registration.checkedInAt
                    ? "Đã check-in"
                    : registration.status === "confirmed"
                      ? "Vé hợp lệ"
                      : "Chưa xác nhận"}
                </div>
                <h3>{registration.fullName}</h3>
                <p className="registration-id">{registration.id}</p>
                <dl>
                  <div>
                    <dt>Hạng vé</dt>
                    <dd>{registration.planName}</dd>
                  </div>
                  <div>
                    <dt>Số tiền</dt>
                    <dd>{formatPrice(registration.amount)}</dd>
                  </div>
                  <div>
                    <dt>Điện thoại</dt>
                    <dd>{registration.phone}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{registration.email}</dd>
                  </div>
                  <div>
                    <dt>Check-in</dt>
                    <dd>{registration.checkedInAt ? new Date(registration.checkedInAt).toLocaleString("vi-VN") : "Chưa"}</dd>
                  </div>
                </dl>
                <button className="secondary-action" type="button" onClick={confirmCheckIn} disabled={!canCheckIn || isLoading}>
                  {isLoading ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
                  Xác nhận cho vào
                </button>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
