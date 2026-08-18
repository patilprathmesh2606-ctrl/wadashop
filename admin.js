document.addEventListener("DOMContentLoaded", () => {

  const loginWrap = document.getElementById("loginWrap");
  const dashWrap = document.getElementById("dashWrap");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const staffNameEl = document.getElementById("staffName");

  let currentStaff = null;   // { id, full_name, role }
  let categories = [];
  let dishes = [];
  let orderFilter = "all";
  let ordersChannel = null;

  const money = (n) => "₹" + Number(n).toFixed(0);
  const STATUS_LABEL = {
    pending: "Pending", accepted: "Accepted", preparing: "Preparing",
    ready: "Ready", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled"
  };

  /* =========================================
     AUTH
     ========================================= */

  async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      await loadStaffProfile(session.user.id);
    } else {
      showLogin();
    }
  }

  async function loadStaffProfile(userId) {
    const { data, error } = await supabaseClient
      .from("staff_profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single();

    if (error || !data || data.role !== "manager") {
      loginError.textContent = "This account is not set up as a manager.";
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
    staffNameEl.textContent = `${currentStaff.full_name} · Manager`;
    initDashboard();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = error.message;
      return;
    }
    await loadStaffProfile(data.user.id);
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  });

  checkSession();

  /* =========================================
     TABS
     ========================================= */

  document.querySelectorAll(".dash-tab[data-panel]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dash-tab[data-panel]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".dash-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(tab.dataset.panel).classList.add("active");
      if (tab.dataset.panel === "reportsPanel") loadReport();
    });
  });

  let dashInitialized = false;

  async function initDashboard() {
    if (dashInitialized) return;
    dashInitialized = true;
    await loadCategories();
    await loadDishes();
    await loadOrders();
    subscribeOrders();
    document.getElementById("reportDate").value = new Date().toISOString().slice(0, 10);
    loadReport();
  }

  /* =========================================
     MENU MANAGEMENT
     ========================================= */

  async function loadCategories() {
    const { data } = await supabaseClient.from("categories").select("id, name, slug").order("sort_order");
    categories = data || [];
    const select = document.getElementById("dishCategory");
    select.innerHTML = categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }

  async function loadDishes() {
    const { data, error } = await supabaseClient
      .from("dishes")
      .select("id, name, description, price, image_url, badge, is_available, category_id, categories(name)")
      .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }
    dishes = data || [];
    renderDishTable();
  }

  function renderDishTable() {
    const body = document.getElementById("dishTableBody");
    if (dishes.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="empty-state">No dishes yet — add your first one above.</td></tr>`;
      return;
    }
    body.innerHTML = dishes.map((d) => `
      <tr>
        <td><img class="dish-thumb" src="${d.image_url || ""}" alt="${d.name}"></td>
        <td><strong>${d.name}</strong>${d.badge ? ` <span class="chip chip-ready">${d.badge}</span>` : ""}</td>
        <td>${d.categories?.name || "—"}</td>
        <td>${money(d.price)}</td>
        <td>${d.is_available ? `<span class="chip chip-completed">Available</span>` : `<span class="chip chip-cancelled">Hidden</span>`}</td>
        <td>
          <div class="order-actions">
            <button class="icon-btn" data-action="edit" data-id="${d.id}">Edit</button>
            <button class="icon-btn" data-action="toggle" data-id="${d.id}">${d.is_available ? "Hide" : "Show"}</button>
            <button class="icon-btn danger" data-action="delete" data-id="${d.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  document.getElementById("dishTableBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const dish = dishes.find((d) => d.id === btn.dataset.id);
    if (!dish) return;

    if (btn.dataset.action === "edit") {
      fillFormForEdit(dish);
    } else if (btn.dataset.action === "toggle") {
      await supabaseClient.from("dishes").update({ is_available: !dish.is_available }).eq("id", dish.id);
      await loadDishes();
    } else if (btn.dataset.action === "delete") {
      if (!confirm(`Delete "${dish.name}"? This cannot be undone.`)) return;
      await supabaseClient.from("dishes").delete().eq("id", dish.id);
      await loadDishes();
    }
  });

  function fillFormForEdit(dish) {
    document.getElementById("dishFormTitle").textContent = "Edit Dish";
    document.getElementById("dishId").value = dish.id;
    document.getElementById("dishName").value = dish.name;
    document.getElementById("dishCategory").value = dish.category_id || "";
    document.getElementById("dishPrice").value = dish.price;
    document.getElementById("dishBadge").value = dish.badge || "";
    document.getElementById("dishDescription").value = dish.description || "";
    document.getElementById("dishSubmitBtn").textContent = "Update Dish";
    document.getElementById("dishCancelEdit").style.display = "inline-block";
    document.getElementById("dishPanel")?.scrollIntoView?.({ behavior: "smooth" });
  }

  function resetDishForm() {
    document.getElementById("dishForm").reset();
    document.getElementById("dishId").value = "";
    document.getElementById("dishFormTitle").textContent = "Add a New Dish";
    document.getElementById("dishSubmitBtn").textContent = "Save Dish";
    document.getElementById("dishCancelEdit").style.display = "none";
  }

  document.getElementById("dishCancelEdit").addEventListener("click", resetDishForm);

  document.getElementById("dishForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const msg = document.getElementById("dishFormMsg");
    msg.textContent = "";
    msg.classList.remove("error-message");

    const id = document.getElementById("dishId").value;
    const name = document.getElementById("dishName").value.trim();
    const category_id = document.getElementById("dishCategory").value;
    const price = Number(document.getElementById("dishPrice").value);
    const badge = document.getElementById("dishBadge").value.trim() || null;
    const description = document.getElementById("dishDescription").value.trim();
    const file = document.getElementById("dishPhoto").files[0];

    const submitBtn = document.getElementById("dishSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      let image_url;
      if (file) {
        const path = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
        const { error: uploadError } = await supabaseClient.storage
          .from("dish-photos")
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabaseClient.storage.from("dish-photos").getPublicUrl(path);
        image_url = publicUrlData.publicUrl;
      }

      const payload = { name, category_id, price, badge, description };
      if (image_url) payload.image_url = image_url;

      if (id) {
        const { error } = await supabaseClient.from("dishes").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        if (!image_url) {
          payload.image_url = "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=900&q=85";
        }
        const { error } = await supabaseClient.from("dishes").insert(payload);
        if (error) throw error;
      }

      msg.style.color = "#39834a";
      msg.textContent = "Saved!";
      resetDishForm();
      await loadDishes();
    } catch (err) {
      msg.classList.add("error-message");
      msg.textContent = err.message || "Something went wrong.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? "Update Dish" : "Save Dish";
    }
  });

  /* =========================================
     ORDERS
     ========================================= */

  let allOrders = [];

  async function loadOrders() {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("id, order_number, customer_name, customer_phone, customer_note, status, subtotal, tax_amount, grand_total, placed_at, order_items(dish_name, quantity, line_total)")
      .order("placed_at", { ascending: false })
      .limit(200);

    if (error) { console.error(error); return; }
    allOrders = data || [];
    renderOrders();
  }

  function subscribeOrders() {
    ordersChannel = supabaseClient
      .channel("admin:orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadOrders)
      .subscribe();
  }

  document.getElementById("orderFilterRow").addEventListener("click", (event) => {
    const btn = event.target.closest(".dash-tab");
    if (!btn) return;
    document.querySelectorAll("#orderFilterRow .dash-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    orderFilter = btn.dataset.status;
    renderOrders();
  });

  const NEXT_STATUS = {
    pending: [["accepted", "Accept Order"], ["cancelled", "Cancel"]],
    accepted: [["preparing", "Start Preparing"], ["cancelled", "Cancel"]],
    preparing: [["ready", "Mark Ready"], ["cancelled", "Cancel"]],
    ready: [["delivered", "Mark Delivered"]],
    delivered: [["completed", "Force Complete"]],
    completed: [],
    cancelled: []
  };

  function renderOrders() {
    const list = document.getElementById("ordersList");
    const filtered = orderFilter === "all" ? allOrders : allOrders.filter((o) => o.status === orderFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state">No orders here yet.</div>`;
      return;
    }

    list.innerHTML = filtered.map((o) => `
      <div class="order-card">
        <div class="order-card-head">
          <strong>${o.order_number}</strong>
          <span class="chip chip-${o.status}">${STATUS_LABEL[o.status]}</span>
        </div>
        <div style="font-size:13.5px;color:#806e60">${o.customer_name} · ${o.customer_phone} · ${new Date(o.placed_at).toLocaleString()}</div>
        ${o.customer_note ? `<div style="font-size:13px;color:#b85c20;margin-top:6px">Note: ${o.customer_note}</div>` : ""}
        <ul>
          ${o.order_items.map((i) => `<li><span>${i.dish_name} × ${i.quantity}</span><span>${money(i.line_total)}</span></li>`).join("")}
        </ul>
        <div class="order-card-foot">
          <strong>${money(o.grand_total)} <span style="font-weight:500;font-size:12.5px;color:#806e60">(incl. tax ${money(o.tax_amount)})</span></strong>
          <div class="order-actions">
            ${(NEXT_STATUS[o.status] || []).map(([status, label]) =>
              `<button class="icon-btn ${status === "cancelled" ? "danger" : ""}" data-action="status" data-id="${o.id}" data-status="${status}">${label}</button>`
            ).join("")}
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

  /* =========================================
     REPORTS
     ========================================= */

  document.getElementById("reportDate").addEventListener("change", loadReport);

  async function loadReport() {
    const dateStr = document.getElementById("reportDate").value;
    if (!dateStr) return;

    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59.999");

    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, completed_at, subtotal, tax_amount, grand_total")
      .eq("status", "completed")
      .gte("completed_at", dayStart.toISOString())
      .lte("completed_at", dayEnd.toISOString())
      .order("completed_at", { ascending: false });

    if (error) { console.error(error); return; }

    const rows = data || [];
    const totalSubtotal = rows.reduce((s, r) => s + Number(r.subtotal), 0);
    const totalTax = rows.reduce((s, r) => s + Number(r.tax_amount), 0);
    const totalIncome = rows.reduce((s, r) => s + Number(r.grand_total), 0);

    document.getElementById("statOrders").textContent = rows.length;
    document.getElementById("statSubtotal").textContent = money(totalSubtotal);
    document.getElementById("statTax").textContent = money(totalTax);
    document.getElementById("statIncome").textContent = money(totalIncome);

    const body = document.getElementById("reportTableBody");
    body.innerHTML = rows.length === 0
      ? `<tr><td colspan="6" class="empty-state">No completed orders on this date.</td></tr>`
      : rows.map((r) => `
        <tr>
          <td>${r.order_number}</td>
          <td>${r.customer_name}</td>
          <td>${new Date(r.completed_at).toLocaleTimeString()}</td>
          <td>${money(r.subtotal)}</td>
          <td>${money(r.tax_amount)}</td>
          <td><strong>${money(r.grand_total)}</strong></td>
        </tr>
      `).join("");
  }

});
