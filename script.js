document.addEventListener("DOMContentLoaded", () => {

  /* =========================================
     STATE
     ========================================= */

  let dishes = [];              // all available dishes, loaded from Supabase
  let activeFilter = "all";
  let cart = loadCart();        // [{dish_id, name, price, image_url, quantity}]

  const money = (n) => "₹" + Number(n).toFixed(0);

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem("wcw_cart")) || [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem("wcw_cart", JSON.stringify(cart));
  }

  /* =========================================
     1. LOAD MENU FROM SUPABASE
     ========================================= */

  const menuGrid = document.getElementById("menuGrid");

  async function loadDishes() {
    const { data, error } = await supabaseClient
      .from("dishes")
      .select("id, name, description, price, image_url, badge, is_available, categories(slug, name)")
      .eq("is_available", true)
      .order("created_at", { ascending: true });

    if (error) {
      menuGrid.innerHTML = `<p class="menu-loading">Couldn't load the menu right now. Please refresh.</p>`;
      console.error(error);
      return;
    }

    dishes = data || [];
    renderMenu();
  }

  function renderMenu() {
    const visible = dishes.filter(
      (d) => activeFilter === "all" || d.categories?.slug === activeFilter
    );

    if (visible.length === 0) {
      menuGrid.innerHTML = `<p class="menu-loading">No dishes in this category yet.</p>`;
      return;
    }

    menuGrid.innerHTML = visible.map((d) => `
      <article class="menu-card" data-id="${d.id}">
        <div class="food-image">
          <img src="${d.image_url || "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=900&q=85"}" alt="${d.name}">
          ${d.badge ? `<span class="badge">${d.badge}</span>` : ""}
        </div>
        <div class="card-body">
          <h3>${d.name}</h3>
          <p>${d.description || ""}</p>
          <div class="card-bottom">
            <strong>${money(d.price)}</strong>
            <button class="add-btn" data-id="${d.id}">+</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  // live updates if a manager changes the menu while someone is browsing
  supabaseClient
    .channel("public:dishes")
    .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, loadDishes)
    .subscribe();

  loadDishes();

  /* =========================================
     2. MENU CATEGORY FILTER
     ========================================= */

  const filterButtons = document.querySelectorAll(".filter-btn");

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      renderMenu();
    });
  });

  /* =========================================
     3. ADD TO CART (delegated, since menu is dynamic)
     ========================================= */

  menuGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".add-btn");
    if (!button) return;

    const dish = dishes.find((d) => d.id === button.dataset.id);
    if (!dish) return;

    const existing = cart.find((item) => item.dish_id === dish.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ dish_id: dish.id, name: dish.name, price: dish.price, image_url: dish.image_url, quantity: 1 });
    }
    saveCart();
    renderCart();

    button.textContent = "✓";
    setTimeout(() => { button.textContent = "+"; }, 900);
  });

  /* =========================================
     4. CART DRAWER
     ========================================= */

  const cartBtn = document.getElementById("cartBtn");
  const cartCount = document.getElementById("cartCount");
  const cartDrawer = document.getElementById("cartDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const cartCloseBtn = document.getElementById("cartCloseBtn");
  const cartItemsEl = document.getElementById("cartItems");
  const cartSubtotalEl = document.getElementById("cartSubtotal");
  const checkoutBtn = document.getElementById("checkoutBtn");

  function cartSubtotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function renderCart() {
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalQty;
    cartCount.style.display = totalQty > 0 ? "inline-flex" : "none";

    if (cart.length === 0) {
      cartItemsEl.innerHTML = `<p class="cart-empty">Your plate is empty. Add something delicious!</p>`;
      checkoutBtn.disabled = true;
    } else {
      cartItemsEl.innerHTML = cart.map((item) => `
        <div class="cart-item" data-id="${item.dish_id}">
          <img src="${item.image_url || ""}" alt="${item.name}">
          <div class="cart-item-info">
            <h4>${item.name}</h4>
            <span>${money(item.price)}</span>
            <div class="qty-control">
              <button class="qty-btn" data-action="dec" data-id="${item.dish_id}">−</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" data-action="inc" data-id="${item.dish_id}">+</button>
              <button class="remove-btn" data-action="remove" data-id="${item.dish_id}">Remove</button>
            </div>
          </div>
        </div>
      `).join("");
      checkoutBtn.disabled = false;
    }

    cartSubtotalEl.textContent = money(cartSubtotal());
  }

  cartItemsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const item = cart.find((i) => i.dish_id === id);
    if (!item) return;

    if (btn.dataset.action === "inc") item.quantity += 1;
    if (btn.dataset.action === "dec") item.quantity = Math.max(1, item.quantity - 1);
    if (btn.dataset.action === "remove") cart = cart.filter((i) => i.dish_id !== id);

    saveCart();
    renderCart();
  });

  function openCart() {
    cartDrawer.classList.add("open");
    drawerOverlay.classList.add("open");
  }
  function closeCart() {
    cartDrawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
  }

  cartBtn.addEventListener("click", openCart);
  cartCloseBtn.addEventListener("click", closeCart);
  drawerOverlay.addEventListener("click", () => {
    closeCart();
    closeCheckout();
    closeConfirm();
  });

  renderCart();

  /* =========================================
     5. CHECKOUT
     ========================================= */

  const checkoutOverlay = document.getElementById("checkoutOverlay");
  const checkoutCloseBtn = document.getElementById("checkoutCloseBtn");
  const checkoutForm = document.getElementById("checkoutForm");
  const checkoutSummary = document.getElementById("checkoutSummary");
  const checkoutError = document.getElementById("checkoutError");

  function openCheckout() {
    if (cart.length === 0) return;
    checkoutSummary.innerHTML = cart.map((item) =>
      `<div class="summary-row"><span>${item.name} × ${item.quantity}</span><span>${money(item.price * item.quantity)}</span></div>`
    ).join("") + `<div class="summary-row summary-total"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div>`;
    checkoutError.textContent = "";
    closeCart();
    checkoutOverlay.classList.add("open");
  }

  function closeCheckout() {
    checkoutOverlay.classList.remove("open");
  }

  checkoutBtn.addEventListener("click", openCheckout);
  checkoutCloseBtn.addEventListener("click", closeCheckout);

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    checkoutError.textContent = "";

    const name = document.getElementById("checkoutName").value.trim();
    const phone = document.getElementById("checkoutPhone").value.trim();
    const note = document.getElementById("checkoutNote").value.trim();
    const submitBtn = checkoutForm.querySelector("button[type=submit]");

    submitBtn.disabled = true;
    submitBtn.textContent = "Placing order...";

    const items = cart.map((item) => ({ dish_id: item.dish_id, quantity: item.quantity }));

    const { data, error } = await supabaseClient.rpc("place_order", {
      p_customer_name: name,
      p_customer_phone: phone,
      p_customer_note: note,
      p_items: items
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Place Order";

    if (error) {
      checkoutError.textContent = error.message || "Something went wrong placing your order.";
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    showOrderConfirmation(result.order_number, result.access_code);

    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    closeCheckout();
  });

  /* =========================================
     6. ORDER CONFIRMATION / INVOICE MODAL
     ========================================= */

  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmCloseBtn = document.getElementById("confirmCloseBtn");
  const confirmContent = document.getElementById("confirmContent");

  function showOrderConfirmation(orderNumber, accessCode) {
    confirmContent.innerHTML = `
      <div class="confirm-icon">🧇</div>
      <h3>Order Placed!</h3>
      <p>Your order is in the kitchen's queue. Save these details to track it and view your invoice:</p>
      <div class="order-code-box">
        <div><span>Order Number</span><strong>${orderNumber}</strong></div>
        <div><span>Order Code</span><strong>${accessCode}</strong></div>
      </div>
      <p class="small-note">We've prefilled the tracking form for you below.</p>
      <button class="btn btn-primary submit-btn" id="goTrackBtn">Track This Order</button>
    `;
    confirmOverlay.classList.add("open");

    document.getElementById("goTrackBtn").addEventListener("click", () => {
      closeConfirm();
      document.getElementById("trackOrderNumber").value = orderNumber;
      document.getElementById("trackAccessCode").value = accessCode;
      document.getElementById("track").scrollIntoView({ behavior: "smooth" });
      trackForm.requestSubmit();
    });
  }

  function closeConfirm() {
    confirmOverlay.classList.remove("open");
  }

  confirmCloseBtn.addEventListener("click", closeConfirm);

  /* =========================================
     7. TRACK ORDER
     ========================================= */

  const trackForm = document.getElementById("trackForm");
  const trackError = document.getElementById("trackError");
  const trackResult = document.getElementById("trackResult");

  const STATUS_STEPS = ["pending", "accepted", "preparing", "ready", "delivered", "completed"];
  const STATUS_LABELS = {
    pending: "Order received",
    accepted: "Accepted by kitchen",
    preparing: "Being prepared",
    ready: "Ready",
    delivered: "Delivered — awaiting your confirmation",
    completed: "Completed",
    cancelled: "Cancelled"
  };

  let trackedOrder = null;
  let trackChannel = null;

  trackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    trackError.textContent = "";

    const orderNumber = document.getElementById("trackOrderNumber").value.trim();
    const accessCode = document.getElementById("trackAccessCode").value.trim();

    const { data, error } = await supabaseClient.rpc("get_order_status", {
      p_order_number: orderNumber,
      p_access_code: accessCode
    });

    if (error) {
      trackError.textContent = error.message || "Order not found.";
      trackResult.classList.add("hidden");
      return;
    }

    trackedOrder = data;
    renderTrackResult(data);
    subscribeToOrder(orderNumber, accessCode);
  });

  function subscribeToOrder(orderNumber, accessCode) {
    if (trackChannel) supabaseClient.removeChannel(trackChannel);
    trackChannel = supabaseClient
      .channel("track:" + orderNumber)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, async () => {
        const { data } = await supabaseClient.rpc("get_order_status", {
          p_order_number: orderNumber,
          p_access_code: accessCode
        });
        if (data) {
          trackedOrder = data;
          renderTrackResult(data);
        }
      })
      .subscribe();
  }

  function renderTrackResult(order) {
    trackResult.classList.remove("hidden");

    const stepIndex = STATUS_STEPS.indexOf(order.status);
    const isCancelled = order.status === "cancelled";

    const stepsHtml = STATUS_STEPS.map((step, i) => `
      <div class="status-step ${!isCancelled && i <= stepIndex ? "done" : ""} ${!isCancelled && i === stepIndex ? "current" : ""}">
        <span class="status-dot"></span>
        <span class="status-label">${STATUS_LABELS[step]}</span>
      </div>
    `).join("");

    const itemsHtml = order.items.map((item) =>
      `<div class="summary-row"><span>${item.dish_name} × ${item.quantity}</span><span>₹${Number(item.line_total).toFixed(0)}</span></div>`
    ).join("");

    trackResult.innerHTML = `
      <div class="order-status-header">
        <h3>${order.order_number}</h3>
        <span class="status-pill status-${order.status}">${STATUS_LABELS[order.status] || order.status}</span>
      </div>

      ${isCancelled ? `<p class="feedback-message error-message">This order was cancelled.</p>` : `<div class="status-track">${stepsHtml}</div>`}

      <div class="checkout-summary">
        ${itemsHtml}
        <div class="summary-row"><span>Subtotal</span><span>₹${Number(order.subtotal).toFixed(0)}</span></div>
        <div class="summary-row"><span>Tax (${order.tax_rate}%)</span><span>₹${Number(order.tax_amount).toFixed(0)}</span></div>
        <div class="summary-row summary-total"><span>Grand Total</span><span>₹${Number(order.grand_total).toFixed(0)}</span></div>
      </div>

      ${order.status === "delivered" ? `<button class="btn btn-primary submit-btn" id="confirmReceiptBtn">I've Received My Order</button>` : ""}
      ${order.status === "completed" ? `<p class="invoice-note">✅ Thank you! This is your final invoice — screenshot or print for your records.</p>` : ""}
      <p id="trackActionMsg" class="feedback-message"></p>
    `;

    const confirmBtn = document.getElementById("confirmReceiptBtn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Confirming...";
        const { error } = await supabaseClient.rpc("confirm_order_receipt", {
          p_order_number: order.order_number,
          p_access_code: document.getElementById("trackAccessCode").value.trim()
        });
        if (error) {
          document.getElementById("trackActionMsg").textContent = error.message;
          document.getElementById("trackActionMsg").classList.add("error-message");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "I've Received My Order";
        } else {
          const { data } = await supabaseClient.rpc("get_order_status", {
            p_order_number: order.order_number,
            p_access_code: document.getElementById("trackAccessCode").value.trim()
          });
          renderTrackResult(data);
        }
      });
    }
  }

  /* =========================================
     8. FEEDBACK FORM
     ========================================= */

  const stars = document.querySelectorAll("#stars button");
  let selectedRating = 0;

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating = Number(star.dataset.rating);
      stars.forEach((currentStar) => {
        currentStar.classList.toggle("selected", Number(currentStar.dataset.rating) <= selectedRating);
      });
    });
  });

  const feedbackForm = document.getElementById("feedbackForm");
  const feedbackMessage = document.getElementById("feedbackMessage");

  if (feedbackForm) {
    feedbackForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (selectedRating === 0) {
        feedbackMessage.style.color = "#b85c20";
        feedbackMessage.textContent = "Please select a star rating.";
        return;
      }

      feedbackMessage.style.color = "#39834a";
      feedbackMessage.textContent = "Thank you! Your " + selectedRating + "-star feedback has been recorded.";

      feedbackForm.reset();
      stars.forEach((star) => star.classList.remove("selected"));
      selectedRating = 0;
    });
  }

  /* =========================================
     9. MOBILE NAVIGATION
     ========================================= */

  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => mainNav.classList.toggle("open"));
    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => mainNav.classList.remove("open"));
    });
  }

  /* =========================================
     10. CURRENT YEAR IN FOOTER
     ========================================= */

  const yearElement = document.getElementById("year");
  if (yearElement) yearElement.textContent = new Date().getFullYear();

});
