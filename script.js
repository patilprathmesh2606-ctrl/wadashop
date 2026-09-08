document.addEventListener("DOMContentLoaded", () => {

  /* =========================================
     STATE
     ========================================= */

  let dishes = [];              // all available dishes, loaded from Supabase
  let activeFilter = "all";
  let cart = loadCart();        // [{dish_id, name, price, image_url, quantity}]

  const money = (n) => "₹" + Number(n).toFixed(0);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

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
      menuGrid.innerHTML = `<p class="menu-loading col-span-full text-center py-12 font-body-md text-on-surface-variant">Couldn't load the menu right now. Please refresh.</p>`;
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
      menuGrid.innerHTML = `<p class="menu-loading col-span-full text-center py-12 font-body-md text-on-surface-variant">No dishes in this category yet.</p>`;
      return;
    }

    menuGrid.innerHTML = visible.map((d) => `
      <div class="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between" data-category="${esc(d.categories?.slug || "")}">
        <div>
          <div class="relative w-full aspect-16/10 overflow-hidden bg-surface-container">
            <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="${esc(d.image_url) || "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=900&q=85"}" alt="${esc(d.name)}">
            ${d.badge ? `<span class="absolute top-space-xs right-space-xs px-space-xs py-space-2xs bg-tertiary-container text-on-tertiary-container rounded-full font-label-sm shadow-sm">${esc(d.badge)}</span>` : ""}
          </div>
          <div class="p-space-md flex flex-col gap-space-2xs">
            <h3 class="font-headline-sm text-headline-sm text-primary">${esc(d.name)}</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${esc(d.description || "")}</p>
          </div>
        </div>
        <div class="px-space-md pb-space-md pt-space-xs flex items-center justify-between">
          <span class="font-headline-sm text-headline-sm text-secondary font-bold">${money(d.price)}</span>
          <button class="add-to-plate-btn inline-flex items-center gap-space-2xs px-space-md py-space-xs bg-primary-container hover:bg-primary text-on-primary rounded-full font-label-md transition-colors active:scale-95 shadow-sm" data-id="${esc(d.id)}">
            <span class="material-symbols-outlined text-[16px]">add</span>
            <span>Add to Plate</span>
          </button>
        </div>
      </div>
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
  const ACTIVE_CLASSES = ["bg-primary-container", "text-on-primary", "shadow-sm"];
  const INACTIVE_CLASSES = ["bg-surface-container", "text-on-surface", "hover:bg-surface-container-high"];

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((btn) => {
        btn.classList.remove("active", ...ACTIVE_CLASSES);
        btn.classList.add(...INACTIVE_CLASSES);
      });
      button.classList.add("active", ...ACTIVE_CLASSES);
      button.classList.remove(...INACTIVE_CLASSES);
      renderMenu();
    });
  });

  /* =========================================
     3. ADD TO CART (delegated, since menu is dynamic)
     ========================================= */

  menuGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-plate-btn");
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

    const label = button.querySelector("span:last-child");
    const original = label.textContent;
    label.textContent = "Added ✓";
    setTimeout(() => { label.textContent = original; }, 900);
  });

  /* =========================================
     4. CART DRAWER
     ========================================= */

  const cartBtn = document.getElementById("cart-btn");
  const cartCount = document.getElementById("cartCount");
  const cartDrawer = document.getElementById("cartDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const cartCloseBtn = document.getElementById("cartCloseBtn");
  const cartItemsEl = document.getElementById("cartItems");
  const cartItemsLabel = document.getElementById("cartItemsLabel");
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
      cartItemsEl.innerHTML = `<p class="font-body-md text-on-surface-variant text-center py-space-xl">Your plate is empty. Add something delicious!</p>`;
      checkoutBtn.disabled = true;
      cartItemsLabel.textContent = "Items Subtotal";
    } else {
      cartItemsEl.innerHTML = cart.map((item) => `
        <div class="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-low border border-surface-variant/50 shadow-sm" data-id="${esc(item.dish_id)}">
          <div class="flex items-start gap-space-sm">
            <img src="${esc(item.image_url) || ""}" alt="${esc(item.name)}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-surface-container">
            <div class="flex-1 flex flex-col">
              <div class="flex items-start justify-between gap-space-2xs">
                <h4 class="font-headline-sm text-headline-sm text-primary leading-tight">${esc(item.name)}</h4>
                <button class="text-on-surface-variant hover:text-error transition-colors p-0.5" title="Remove item" data-action="remove" data-id="${esc(item.dish_id)}">
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
              <div class="flex items-center justify-between mt-space-xs pt-space-2xs border-t border-surface-variant/40">
                <div class="flex items-center gap-space-2xs">
                  <span class="font-label-sm text-on-surface-variant">${money(item.price)}</span>
                  <span class="text-[11px] text-on-surface-variant">× ${item.quantity}</span>
                  <span class="font-headline-sm text-headline-sm text-secondary font-bold ml-space-2xs">${money(item.price * item.quantity)}</span>
                </div>
                <div class="flex items-center gap-space-2xs bg-surface-container rounded-full px-space-2xs py-1">
                  <button class="w-6 h-6 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary hover:bg-surface transition-colors" data-action="dec" data-id="${esc(item.dish_id)}">
                    <span class="material-symbols-outlined text-[14px]">remove</span>
                  </button>
                  <span class="font-label-md px-space-xs text-primary font-bold">${item.quantity}</span>
                  <button class="w-6 h-6 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary hover:bg-surface transition-colors" data-action="inc" data-id="${esc(item.dish_id)}">
                    <span class="material-symbols-outlined text-[14px]">add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `).join("");
      checkoutBtn.disabled = false;
      cartItemsLabel.textContent = `Items Subtotal (${totalQty} treat${totalQty > 1 ? "s" : ""})`;
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
    cartDrawer.classList.remove("translate-x-full");
    drawerOverlay.classList.remove("opacity-0", "pointer-events-none");
  }
  function closeCart() {
    cartDrawer.classList.add("translate-x-full");
    drawerOverlay.classList.add("opacity-0", "pointer-events-none");
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
      `<div class="flex items-center justify-between"><span>${esc(item.name)} × ${item.quantity}</span><span class="font-semibold text-on-surface">${money(item.price * item.quantity)}</span></div>`
    ).join("") + `<div class="flex items-center justify-between pt-space-2xs border-t border-surface-variant font-bold text-primary"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div>`;
    checkoutError.classList.add("hidden");
    checkoutError.textContent = "";
    closeCart();
    checkoutOverlay.classList.remove("opacity-0", "pointer-events-none");
  }

  function closeCheckout() {
    checkoutOverlay.classList.add("opacity-0", "pointer-events-none");
  }

  checkoutBtn.addEventListener("click", openCheckout);
  checkoutCloseBtn.addEventListener("click", closeCheckout);

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    checkoutError.classList.add("hidden");
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
      checkoutError.classList.remove("hidden");
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
  const confirmDoneBtn = document.getElementById("confirmDoneBtn");
  const confirmContent = document.getElementById("confirmContent");

  function showOrderConfirmation(orderNumber, accessCode) {
    confirmContent.innerHTML = `
      <h3 class="font-headline-md text-headline-md text-primary">Plate Fired Up!</h3>
      <p class="font-body-md text-on-surface-variant">Order <strong class="text-primary font-semibold">${esc(orderNumber)}</strong> has reached our Wada counter. We've started heating the Belgian irons!</p>
      <div class="mt-space-sm p-space-sm rounded-xl bg-surface-container text-on-surface font-body-sm">
        Access Code: <span class="font-bold text-secondary">${esc(accessCode)}</span>
      </div>
      <p class="font-body-sm text-on-surface-variant">Save these details to track your order below.</p>
      <button class="w-full py-space-sm bg-primary-container hover:bg-primary text-on-primary font-label-lg rounded-xl transition-all shadow-sm mt-space-xs" id="goTrackBtn">Track This Order</button>
    `;
    confirmOverlay.classList.remove("opacity-0", "pointer-events-none");

    document.getElementById("goTrackBtn").addEventListener("click", () => {
      closeConfirm();
      document.getElementById("trackOrderNumber").value = orderNumber;
      document.getElementById("trackAccessCode").value = accessCode;
      document.getElementById("track").scrollIntoView({ behavior: "smooth" });
      trackForm.requestSubmit();
    });
  }

  function closeConfirm() {
    confirmOverlay.classList.add("opacity-0", "pointer-events-none");
  }

  confirmCloseBtn.addEventListener("click", closeConfirm);
  if (confirmDoneBtn) confirmDoneBtn.addEventListener("click", closeConfirm);

  /* =========================================
     7. TRACK ORDER
     ========================================= */

  const trackForm = document.getElementById("trackForm");
  const trackError = document.getElementById("trackError");
  const trackResult = document.getElementById("trackResult");

  const STATUS_STEPS = ["pending", "accepted", "preparing", "ready", "delivered"];
  const STATUS_ICONS = { pending: "receipt_long", accepted: "check", preparing: "rotate_right", ready: "notifications", delivered: "done_all" };
  const STATUS_LABELS = {
    pending: "Pending",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  const HEADER_LABELS = {
    pending: "Order Received",
    accepted: "Accepted by Kitchen",
    preparing: "In The Griddle",
    ready: "Ready for Pickup",
    delivered: "Delivered — awaiting your confirmation",
    completed: "Completed",
    cancelled: "Cancelled"
  };

  let trackChannel = null;
  const LAST_ORDER_KEY = "wcw_last_order";

  async function trackOrder(orderNumber, accessCode, { silent = false } = {}) {
    if (!silent) {
      trackError.classList.add("hidden");
      trackError.textContent = "";
    }

    if (!orderNumber || !accessCode) {
      if (!silent) {
        trackError.textContent = "Please check your Order Number and Access Code.";
        trackError.classList.remove("hidden");
        trackResult.classList.add("hidden");
      }
      return;
    }

    const { data, error } = await supabaseClient.rpc("get_order_status", {
      p_order_number: orderNumber,
      p_access_code: accessCode
    });

    if (error) {
      if (!silent) {
        trackError.textContent = error.message || "Order not found.";
        trackError.classList.remove("hidden");
        trackResult.classList.add("hidden");
      }
      // stop remembering an order that no longer resolves (e.g. wrong/old code)
      localStorage.removeItem(LAST_ORDER_KEY);
      return;
    }

    // remember this order so a page refresh keeps showing it
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ orderNumber, accessCode }));

    renderTrackResult(data);
    subscribeToOrder(orderNumber, accessCode);
  }

  trackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const orderNumber = document.getElementById("trackOrderNumber").value.trim();
    const accessCode = document.getElementById("trackAccessCode").value.trim();
    trackOrder(orderNumber, accessCode);
  });

  // Restore tracking on page load / refresh
  (function restoreLastTrackedOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_ORDER_KEY));
      if (saved?.orderNumber && saved?.accessCode) {
        document.getElementById("trackOrderNumber").value = saved.orderNumber;
        document.getElementById("trackAccessCode").value = saved.accessCode;
        trackOrder(saved.orderNumber, saved.accessCode, { silent: true });
      }
    } catch {
      localStorage.removeItem(LAST_ORDER_KEY);
    }
  })();

  function subscribeToOrder(orderNumber, accessCode) {
    if (trackChannel) supabaseClient.removeChannel(trackChannel);
    trackChannel = supabaseClient
      .channel("track:" + orderNumber)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: "order_number=eq." + orderNumber },
        async () => {
          const { data } = await supabaseClient.rpc("get_order_status", {
            p_order_number: orderNumber,
            p_access_code: accessCode
          });
          if (data) renderTrackResult(data);
        }
      )
      .subscribe();
  }

  // Let a customer stop tracking / clear a stale order manually
  const trackStopBtn = document.getElementById("trackStopBtn");
  const trackStopWrap = document.getElementById("trackStopWrap");
  if (trackStopBtn) {
    trackStopBtn.addEventListener("click", () => {
      localStorage.removeItem(LAST_ORDER_KEY);
      if (trackChannel) supabaseClient.removeChannel(trackChannel);
      trackForm.reset();
      trackResult.classList.add("hidden");
      trackResult.classList.remove("flex");
      trackStopWrap.classList.add("hidden");
      trackStopWrap.classList.remove("flex");
    });
  }

  function renderTrackResult(order) {
    trackResult.classList.remove("hidden");
    trackResult.classList.add("flex");
    trackStopWrap.classList.remove("hidden");
    trackStopWrap.classList.add("flex");

    const stepIndex = STATUS_STEPS.indexOf(order.status);
    const isCancelled = order.status === "cancelled";
    const isCompleted = order.status === "completed";
    const effectiveIndex = isCompleted ? STATUS_STEPS.length - 1 : stepIndex;
    const progressPct = isCancelled ? 0 : (effectiveIndex / (STATUS_STEPS.length - 1)) * 100;

    const stepsHtml = STATUS_STEPS.map((step, i) => {
      const done = !isCancelled && i <= effectiveIndex;
      const current = !isCancelled && i === effectiveIndex && !isCompleted;
      let circleClasses = "bg-surface-variant text-on-surface-variant";
      if (done && !current) circleClasses = "bg-secondary text-on-secondary shadow-sm";
      if (current) circleClasses = "bg-secondary-container text-on-secondary-container ring-4 ring-secondary-fixed";
      const icon = done && !current ? "check" : STATUS_ICONS[step];
      const spin = current && step === "preparing" ? "animate-spin" : "";
      return `
        <div class="relative z-10 flex flex-col items-center gap-space-2xs">
          <div class="w-8 h-8 rounded-full flex items-center justify-center ${circleClasses}">
            <span class="material-symbols-outlined text-[16px] ${spin}">${icon}</span>
          </div>
          <span class="font-label-sm text-label-sm ${current ? "text-secondary font-bold" : done ? "text-primary" : "text-on-surface-variant"}">${STATUS_LABELS[step]}</span>
        </div>`;
    }).join("");

    const itemsHtml = order.items.map((item) =>
      `<div class="flex items-center justify-between"><span>${esc(item.dish_name)} × ${item.quantity}</span><span>${money(item.line_total)}</span></div>`
    ).join("");

    trackResult.innerHTML = `
      <div class="flex items-center justify-between pb-space-sm border-b border-surface-variant">
        <div>
          <span class="font-label-sm text-on-surface-variant uppercase">Tracking Order</span>
          <h4 class="font-headline-sm text-headline-sm text-primary">${esc(order.order_number)}</h4>
        </div>
        <span class="px-space-sm py-space-2xs rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm">${HEADER_LABELS[order.status] || order.status}</span>
      </div>

      ${isCancelled
        ? `<div class="feedback-message error-message px-space-md py-space-xs rounded-lg bg-error-container text-on-error-container font-body-sm">This order was cancelled.</div>`
        : `<div class="relative flex items-center justify-between w-full">
             <div class="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-surface-variant w-full z-0"></div>
             <div class="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-secondary z-0 transition-all duration-500" style="width:${progressPct}%"></div>
             ${stepsHtml}
           </div>`
      }

      <div class="flex flex-col gap-space-2xs p-space-sm rounded-xl bg-surface-container-low font-body-sm">
        ${itemsHtml}
        <div class="flex items-center justify-between pt-space-2xs border-t border-surface-variant"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
        <div class="flex items-center justify-between"><span>Tax (${order.tax_rate}%)</span><span>${money(order.tax_amount)}</span></div>
        <div class="flex items-center justify-between font-bold text-primary"><span>Grand Total</span><span>${money(order.grand_total)}</span></div>
      </div>

      ${order.status === "delivered" ? `<button class="w-full py-space-sm bg-primary-container hover:bg-primary text-on-primary font-label-lg rounded-xl transition-all shadow-sm" id="confirmReceiptBtn">I've Received My Order</button>` : ""}
      ${order.status === "completed" ? `<p class="font-body-sm text-on-surface-variant">✅ Thank you! This is your final invoice — screenshot or print for your records.</p>` : ""}
      <p id="trackActionMsg" class="feedback-message font-body-sm"></p>
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
          const msgEl = document.getElementById("trackActionMsg");
          msgEl.textContent = error.message;
          msgEl.classList.add("error-message");
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

  const stars = document.querySelectorAll("#stars .star-btn");
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

      feedbackMessage.classList.remove("hidden");

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
    menuToggle.addEventListener("click", () => {
      mainNav.classList.toggle("hidden");
      mainNav.classList.toggle("flex");
    });
    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.add("hidden");
        mainNav.classList.remove("flex");
      });
    });
  }

  /* =========================================
     10. CURRENT YEAR IN FOOTER
     ========================================= */

  const yearElement = document.getElementById("year");
  if (yearElement) yearElement.textContent = new Date().getFullYear();

});
