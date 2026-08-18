document.addEventListener("DOMContentLoaded", () => {

  const loginWrap = document.getElementById("loginWrap");
  const dashWrap = document.getElementById("dashWrap");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const staffNameEl = document.getElementById("staffName");

  let currentStaff = null;
  let allOrders = [];
  let orderFilter = "active";

  const money = (n) => "₹" + Number(n).toFixed(0);
  const STATUS_LABEL = {
    pending: "New", accepted: "Accepted", preparing: "Preparing",
    ready: "Ready", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled"
  };

  // Kitchen can only push orders forward through the active cooking stages.
  const NEXT_STATUS = {
    pending: [["accepted", "Accept"]],
    accepted: [["preparing", "Start Preparing"]],
    preparing: [["ready", "Mark Ready"]],
    ready: [["delivered", "Mark Delivered"]],
    delivered: [],
    completed: [],
    cancelled: []
  };

  /* AUTH */
  async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await loadStaffProfile(session.user.id);
    else showLogin();
  }

  async function loadStaffProfile(userId) {
    const { data, error } = await supabaseClient
      .from("staff_profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single();

    if (error || !data || !["kitchen", "manager"].includes(data.role)) {
      loginError.textContent = "This account isn't set up for kitchen access.";
      await supabaseClient.auth.signOut();
      showLogin();
      return;
    }

    currentStaff = data;
    showDashboard();
  }

  function showLogin() {
    loginWrap.classList.remove("hidden");
    dashWrap.classList.add("hidden");
  }

  function showDashboard() {
    loginWrap.classList.add("hidden");
    dashWrap.classList.remove("hidden");
    staffNameEl.textContent = `${currentStaff.full_name} · ${currentStaff.role === "manager" ? "Manager" : "Kitchen"}`;
    loadOrders();
    supabaseClient
      .channel("kitchen:orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadOrders)
      .subscribe();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { loginError.textContent = error.message; return; }
    await loadStaffProfile(data.user.id);
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  });

  checkSession();

  /* ORDERS */
  async function loadOrders() {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("id, order_number, customer_name, customer_phone, customer_note, status, placed_at, order_items(dish_name, quantity)")
      .in("status", ["pending", "accepted", "preparing", "ready", "delivered"])
      .order("placed_at", { ascending: true });

    if (error) { console.error(error); return; }
    allOrders = data || [];
    renderOrders();
  }

  document.getElementById("orderFilterRow").addEventListener("click", (event) => {
    const btn = event.target.closest(".dash-tab");
    if (!btn) return;
    document.querySelectorAll("#orderFilterRow .dash-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    orderFilter = btn.dataset.status;
    renderOrders();
  });

  function renderOrders() {
    const list = document.getElementById("ordersList");
    const filtered = orderFilter === "active"
      ? allOrders.filter((o) => o.status !== "delivered")
      : allOrders.filter((o) => o.status === orderFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state">Nothing here right now 🧇</div>`;
      return;
    }

    list.innerHTML = filtered.map((o) => `
      <div class="order-card">
        <div class="order-card-head">
          <strong>${o.order_number}</strong>
          <span class="chip chip-${o.status}">${STATUS_LABEL[o.status]}</span>
        </div>
        <div style="font-size:13.5px;color:#806e60">${o.customer_name} · ${new Date(o.placed_at).toLocaleTimeString()}</div>
        ${o.customer_note ? `<div style="font-size:13px;color:#b85c20;margin-top:6px">Note: ${o.customer_note}</div>` : ""}
        <ul>
          ${o.order_items.map((i) => `<li><span>${i.dish_name}</span><span>× ${i.quantity}</span></li>`).join("")}
        </ul>
        <div class="order-card-foot">
          <div class="order-actions">
            ${(NEXT_STATUS[o.status] || []).map(([status, label]) =>
              `<button class="icon-btn" data-action="status" data-id="${o.id}" data-status="${status}">${label}</button>`
            ).join("") || "<em style='color:#806e60;font-size:13px'>Waiting on the customer</em>"}
          </div>
        </div>
      </div>
    `).join("");
  }

  document.getElementById("ordersList").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action='status']");
    if (!btn) return;
    btn.disabled = true;
    const { error } = await supabaseClient.rpc("update_order_status", {
      p_order_id: btn.dataset.id,
      p_new_status: btn.dataset.status
    });
    if (error) alert(error.message);
    await loadOrders();
  });

});
