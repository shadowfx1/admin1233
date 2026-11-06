/* ==========================================================================
   راية القانون — سكربت لوحة التحكم المشترك
   Shared admin runtime: session guard, API client, UI helpers, formatting.
   The authoritative protection lives on the server; this file only improves UX.
   ========================================================================== */
(function () {
  "use strict";

  const ICONS = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>',
    inbox: '<path d="M4 4h16v12H5.2L4 18z"/><path d="M8 8h8M8 12h5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.4A4.8 4.8 0 0 1 21.5 19"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 21h16"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.4 3.3M6.3 7.8A17 17 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 9v6M12 18h.01"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v11h14V9M9 13h6"/>',
    note: '<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    wa: '<path d="M20.5 3.5A11.8 11.8 0 0 0 12 0 12 12 0 0 0 1.6 17.9L0 24l6.3-1.6A12 12 0 1 0 20.5 3.5zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm5.4-7.3c-.3-.2-1.7-.9-2-.9-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 3 3-2 2-2-2-2 2"/>',
    eyeDoc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  };

  function icon(name, cls) {
    const path = ICONS[name] || "";
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  const STATUS = {
    new: { label: "جديد", cls: "new" },
    under_review: { label: "قيد المراجعة", cls: "under_review" },
    contacting: { label: "جارٍ التواصل مع العميل", cls: "contacting" },
    needs_documents: { label: "بانتظار مستندات", cls: "needs_documents" },
    completed: { label: "مكتمل", cls: "completed" },
    closed: { label: "مغلق", cls: "closed" },
    cancelled: { label: "ملغي", cls: "cancelled" },
  };
  const STATUS_ORDER = ["new", "under_review", "contacting", "needs_documents", "completed", "closed", "cancelled"];
  const BRANCHES = ["الرياض", "المدينة المنورة"];
  const SERVICES = [
    "الاعتداء الزوجي", "الشرب والقيادة", "جرائم المخدرات", "الجرائم الجنسية",
    "السرقة", "احتيال", "غسيل أموال", "إساءة الأطفال", "استشارة عامة",
  ];

  const statusBadge = (key) => {
    const meta = STATUS[key] || { label: key, cls: "closed" };
    return '<span class="badge ' + meta.cls + '">' + escapeHtml(meta.label) + "</span>";
  };

  function formatDate(iso, withTime) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        year: "numeric", month: "short", day: "2-digit",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(date);
    } catch {
      return date.toISOString().slice(0, withTime ? 16 : 10).replace("T", " ");
    }
  }

  function phoneIntl(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.startsWith("0") ? "966" + digits.slice(1) : digits;
  }

  function redirectToLogin() {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace("/admin/index.html?next=" + next);
  }

  const API = {
    async request(path, options) {
      const opts = Object.assign({ credentials: "same-origin", headers: {} }, options || {});
      if (opts.body && typeof opts.body !== "string") {
        opts.headers["content-type"] = "application/json";
        opts.body = JSON.stringify(opts.body);
      }
      const res = await fetch(path, opts);
      if (res.status === 401) {
        redirectToLogin();
        throw new Error("unauthorized");
      }
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        const message = (data && data.error && data.error.message) || (data && data.message) || "حدث خطأ غير متوقع، حاول مرة أخرى.";
        const error = new Error(message);
        error.status = res.status;
        error.data = data;
        throw error;
      }
      return data;
    },
    get(path) { return this.request(path, { method: "GET" }); },
    post(path, body) { return this.request(path, { method: "POST", body }); },
    patch(path, body) { return this.request(path, { method: "PATCH", body }); },
    del(path) { return this.request(path, { method: "DELETE" }); },
    async download(path) {
      const res = await fetch(path, { credentials: "same-origin" });
      if (res.status === 401) return redirectToLogin();
      if (!res.ok) throw new Error("تعذر تصدير الملف");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "rayat-requests.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    },
  };

  function toast(message, type) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.innerHTML = icon(type === "error" ? "alert" : "check") + "<span>" + escapeHtml(message) + "</span>";
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .2s";
      setTimeout(() => el.remove(), 220);
    }, 3800);
  }

  function confirmDialog(options) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal open";
      modal.innerHTML =
        '<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title" style="max-width:440px">' +
        '<div class="modal-head"><h2 id="confirm-title">' + escapeHtml(options.title || "تأكيد الإجراء") + "</h2>" +
        '<button class="icon-btn" type="button" data-cancel aria-label="إغلاق">' + icon("x") + "</button></div>" +
        '<div class="modal-body"><p style="font-size:.92rem">' + escapeHtml(options.message || "") + "</p></div>" +
        '<div class="modal-foot"><button class="btn btn-line" type="button" data-cancel>إلغاء</button>' +
        '<button class="btn ' + (options.danger ? "btn-danger" : "btn-gold") + '" type="button" data-ok>' + escapeHtml(options.confirmText || "تأكيد") + "</button></div></div>";
      document.body.appendChild(modal);
      const close = (value) => {
        modal.remove();
        document.removeEventListener("keydown", onKey);
        resolve(value);
      };
      const onKey = (event) => { if (event.key === "Escape") close(false); };
      document.addEventListener("keydown", onKey);
      modal.querySelectorAll("[data-cancel]").forEach((btn) => btn.addEventListener("click", () => close(false)));
      modal.querySelector("[data-ok]").addEventListener("click", () => close(true));
      modal.addEventListener("click", (event) => { if (event.target === modal) close(false); });
      modal.querySelector("[data-ok]").focus();
    });
  }

  function hydrateIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach((el) => {
      if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute("data-icon"));
    });
  }

  function initSidebar() {
    const toggle = document.querySelector(".sidebar-toggle");
    const sidebar = document.querySelector(".sidebar");
    const scrim = document.querySelector(".sidebar-scrim");
    if (!toggle || !sidebar) return;
    const compact = window.matchMedia("(max-width:1023px)");
    const setOpen = (open) => {
      const isOpen = compact.matches && open;
      sidebar.classList.toggle("open", isOpen);
      // `inert` only applies while the drawer is off-canvas; on desktop the
      // sidebar is always available (otherwise its links and logout break).
      if (compact.matches) sidebar.toggleAttribute("inert", !isOpen);
      else sidebar.removeAttribute("inert");
      if (scrim) scrim.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    };
    setOpen(false);
    toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
    if (scrim) scrim.addEventListener("click", () => setOpen(false));
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
    sidebar.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => setOpen(false)));
    const onBreakpoint = (event) => {
      if (event.matches) setOpen(false);
      else { sidebar.removeAttribute("inert"); sidebar.classList.remove("open"); if (scrim) scrim.classList.remove("open"); document.body.style.overflow = ""; toggle.setAttribute("aria-expanded", "false"); }
    };
    if (compact.addEventListener) compact.addEventListener("change", onBreakpoint);
  }

  function applyUser(user) {
    document.querySelectorAll("[data-user-name]").forEach((el) => { el.textContent = user.name || user.username; });
    document.querySelectorAll("[data-user-role]").forEach((el) => {
      el.textContent = user.role === "owner" ? "مالك المكتب" : "محامٍ / موظف";
    });
    document.querySelectorAll("[data-user-initial]").forEach((el) => {
      el.textContent = (user.name || user.username || "؟").trim().charAt(0);
    });
    document.querySelectorAll("[data-owner-only]").forEach((el) => {
      el.hidden = user.role !== "owner";
    });
    const path = "/admin/" + (window.location.pathname.split("/").pop() || "dashboard.html");
    document.querySelectorAll(".side-nav a").forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      const active = url.pathname === path;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
    });
  }

  async function init(options) {
    hydrateIcons();
    initSidebar();
    const logoutButtons = document.querySelectorAll("[data-logout]");
    logoutButtons.forEach((btn) => btn.addEventListener("click", async () => {
      btn.disabled = true;
      try { await API.post("/api/auth/logout", {}); } catch { /* ignore */ }
      window.location.replace("/admin/index.html");
    }));
    let user;
    try {
      const data = await API.get("/api/auth/me");
      user = data.user;
    } catch {
      return null;
    }
    applyUser(user);
    if (options && options.ownerOnly && user.role !== "owner") {
      const main = document.querySelector(".content");
      if (main) {
        main.innerHTML = '<div class="card"><div class="card-body empty">' + icon("lock") +
          "<h2 style=\"font-size:1.1rem;margin-bottom:.4rem\">هذه الصفحة متاحة لمالك المكتب فقط</h2>" +
          '<p class="small">يمكنك إدارة طلبات الاستشارة ومتابعتها، أو طلب صلاحية إضافية من مالك المكتب.</p>' +
          '<a class="btn btn-line" style="margin-top:1rem" href="/admin/requests.html">الانتقال إلى الطلبات</a></div></div>';
      }
      return { user, restricted: true };
    }
    return { user };
  }

  function debounce(fn, wait) {
    let timer;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait || 350);
    };
  }

  window.Admin = {
    API, STATUS, STATUS_ORDER, BRANCHES, SERVICES,
    icon, escapeHtml, statusBadge, formatDate, phoneIntl,
    toast, confirmDialog, init, debounce, redirectToLogin, hydrateIcons,
  };
})();
