import React, { useEffect, useState, useMemo } from "react";
import "./Orders.css";
import AdminNavbar from "./AdminNavbar";

const API_BASE = "https://mahaveerpapersbe.vercel.app";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [completed, setCompleted] = useState({});
  const [saving, setSaving] = useState({});
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilters, setStatusFilters] = useState({
    Accepted: true,
    Pending: true,
    Declined: true,
    Completed: true,
  });

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/orders`, { headers: { Accept: "application/json" } });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!res.ok) { setError((data && (data.error || data.message)) || "Failed to fetch orders"); return; }
        const ordersArray = Array.isArray(data) ? data : data?.orders || [];
        const normalized = ordersArray.map((order) => {
          let items = [];
          if (Array.isArray(order.items)) items = order.items;
          else if (typeof order.items === "string") {
            try { const parsed = JSON.parse(order.items); items = Array.isArray(parsed) ? parsed : []; } catch { items = []; }
          }
          const itemsNorm = items.map((it) => ({
            product_name: it.product_name ?? it.name ?? "",
            image_url: it.image_url ?? it.image ?? (Array.isArray(it.images) ? it.images[0] : "") ?? "",
            quantity: typeof it.quantity === "number" ? it.quantity : typeof it.qty === "number" ? it.qty : typeof it.quantity_ordered === "number" ? it.quantity_ordered : Number(it.quantity) || Number(it.qty) || 0,
            unit_price_minor: typeof it.unit_price_minor === "number" ? it.unit_price_minor : typeof it.price_minor === "number" ? it.price_minor : typeof it.price === "number" ? Math.round(it.price * 100) : typeof it.price === "string" ? Math.round(Number(it.price) * 100) : 0,
          }));
          return { ...order, items: itemsNorm };
        });
        setOrders(normalized);
        setDecisions((prev) => {
          const next = { ...prev };
          for (const o of normalized) { if (o.decision_status) next[o.id] = o.decision_status; }
          return next;
        });
        setCompleted((prev) => {
          const next = { ...prev };
          for (const o of normalized) { if ((o.fulfill_status || "").toLowerCase() === "completed") next[o.id] = true; }
          return next;
        });
      } catch (err) { setError("Failed to fetch orders: " + (err?.message || "Unknown error")); }
    };
    fetchOrders();
  }, []);

  const toMoney = (minor, cur) => {
    const v = typeof minor === "number" ? minor : Number(minor || 0);
    return `${(v / 100).toFixed(2)} ${cur || ""}`.trim();
  };

  const priceItem = (minor) => {
    const v = typeof minor === "number" ? minor : Number(minor || 0);
    return `₹${(v / 100).toFixed(2)}`;
  };

  const getCustomerType = (order) => {
    if (typeof order.is_b2b === "boolean") return order.is_b2b ? "B2B" : "B2C";
    if (typeof order.customer_type === "string") return order.customer_type.toUpperCase();
    if (typeof order.type === "string") return order.type.toUpperCase();
    if (typeof order.user_type === "string") return order.user_type.toUpperCase();
    const email = order.email || "";
    const domain = email.split("@")[1] || "";
    if (domain && !["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"].includes(domain.toLowerCase())) return "B2B";
    return "B2C";
  };

  const extractAddress = (order) => {
    const a = order.shipping_address || order.address || order.shipping || order.customer_address || {};
    return {
      name: a.name || order.name || order.customer_name || "",
      line1: a.line1 || a.address1 || a.address_line1 || order.address_line1 || "",
      line2: a.line2 || a.address2 || a.address_line2 || order.address_line2 || "",
      city: a.city || order.city || "",
      state: a.state || a.region || order.state || "",
      postal_code: a.postal_code || a.zip || a.pincode || order.postal_code || order.zip || "",
      country: a.country || order.country || "",
      phone: a.phone || order.phone || "",
    };
  };

  const formatAddress = (addr) => {
    const parts = [addr.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(" "), addr.country].filter(Boolean);
    return parts.join(", ");
  };

  const handleRowClick = (order) => setSelectedOrder(order);
  const closeModal = () => setSelectedOrder(null);

  const saveDecision = async (id, decision) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/decision`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision }),
      });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      return { ok: res.ok, data, raw };
    } catch (e) {
      return { ok: false, data: null, raw: String(e?.message || "network error") };
    }
  };

  const completeOrder = async (id) => {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error(data?.error || "Failed to complete order");
      setCompleted((c) => ({ ...c, [id]: true }));
      setDecisions((d) => ({ ...d, [id]: data.order?.decision_status || d[id] || "Accepted" }));
      setOrders((list) =>
        list.map((o) =>
          o.id === id ? { ...o, payment_status: "Completed", fulfill_status: "Completed", decision_status: data.order?.decision_status || o.decision_status || "Accepted" } : o
        )
      );
      setSelectedOrder((o) =>
        o && o.id === id ? { ...o, payment_status: "Completed", fulfill_status: "Completed", decision_status: data.order?.decision_status || o.decision_status || "Accepted" } : o
      );
      if (data?.emailSent && (data?.whatsappSent || data?.whatsapp?.sent)) {
        setNotice("Email and WhatsApp invoice sent");
      } else if (data?.emailSent) {
        setNotice("Email sent to customer");
      } else if (data?.whatsappSent || data?.whatsapp?.sent) {
        setNotice("WhatsApp invoice sent");
      } else if (typeof data?.emailSent !== "undefined" || typeof data?.whatsappSent !== "undefined" || data?.whatsapp) {
        setNotice("Notification sending failed");
      }
      if (notice) setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setNotice("Failed to mark completed");
      setTimeout(() => setNotice(""), 3000);
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const acceptOrder = async (id) => {
    setSaving((s) => ({ ...s, [id]: true }));
    const { ok, data } = await saveDecision(id, "Accepted");
    if (ok) {
      setDecisions((d) => ({ ...d, [id]: "Accepted" }));
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, decision_status: "Accepted" } : o)));
      setSelectedOrder((o) => (o && o.id === id ? { ...o, local_status: "Accepted", decision_status: "Accepted" } : o));
      if (data?.emailSent && (data?.whatsappSent || data?.whatsapp?.sent)) {
        setNotice("Email and WhatsApp invoice sent");
      } else if (data?.emailSent) {
        setNotice("Email sent to customer");
      } else if (data?.whatsappSent || data?.whatsapp?.sent) {
        setNotice("WhatsApp invoice sent");
      } else if (typeof data?.emailSent !== "undefined" || typeof data?.whatsappSent !== "undefined" || data?.whatsapp) {
        setNotice(data?.emailError ? `Notification failed: ${data.emailError}` : "Notification failed");
      }
      setTimeout(() => setNotice(""), 3000);
    } else {
      setNotice("Failed to accept order");
      setTimeout(() => setNotice(""), 3000);
    }
    setSaving((s) => ({ ...s, [id]: false }));
  };

  const declineOrder = async (id) => {
    setSaving((s) => ({ ...s, [id]: true }));
    const { ok } = await saveDecision(id, "Declined");
    if (ok) {
      setDecisions((d) => ({ ...d, [id]: "Declined" }));
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, decision_status: "Declined" } : o)));
      setSelectedOrder((o) => (o && o.id === id ? { ...o, local_status: "Declined", decision_status: "Declined" } : o));
    } else {
      setNotice("Failed to decline order");
      setTimeout(() => setNotice(""), 3000);
    }
    setSaving((s) => ({ ...s, [id]: false }));
  };

  const getDecision = (order) => decisions[order.id] || order.decision_status || "Pending";
  const getEffectiveStatus = (order) => completed[order.id] || (order.fulfill_status || "").toLowerCase() === "completed" ? "Completed" : getDecision(order);
  const displayDecision = (order) => (getEffectiveStatus(order) === "Completed" ? "Order completed" : getEffectiveStatus(order));
  const displayPayment = (order) => completed[order.id] || (order.fulfill_status || "").toLowerCase() === "completed" ? "Completed" : (order.payment_status || "—");

  const filteredAndSortedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (o) =>
      !q ||
      (o.id + "").toLowerCase().includes(q) ||
      (o.email || "").toLowerCase().includes(q) ||
      (o.payment_status || "").toLowerCase().includes(q) ||
      o.items.some((it) => (it.product_name || "").toLowerCase().includes(q));
    const matchesStatus = (o) => {
      const s = getEffectiveStatus(o);
      return !!statusFilters[s] && statusFilters[s] === true;
    };
    const rank = (o) => {
      const s = getEffectiveStatus(o);
      const m = { Accepted: 0, Pending: 1, Declined: 2, Completed: 3 };
      return m[s] ?? 1;
    };
    return [...orders]
      .filter((o) => matchesSearch(o) && matchesStatus(o))
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
  }, [orders, search, decisions, completed, statusFilters]);

  const toggleFilter = (key) => {
    setStatusFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  return (
    <div className="orders-root">
      <AdminNavbar />
      <div className="orders-container">
        <h2 className="table-title">Orders</h2>
        <div className="orders-toolbar">
          <input className="orders-search" placeholder="Search by Order ID, email, product, payment status" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="status-filters">
            <label className={`chip ${statusFilters.Accepted ? "on" : "off"}`}>
              <input type="checkbox" checked={statusFilters.Accepted} onChange={() => toggleFilter("Accepted")} />
              Accepted
            </label>
            <label className={`chip ${statusFilters.Pending ? "on" : "off"}`}>
              <input type="checkbox" checked={statusFilters.Pending} onChange={() => toggleFilter("Pending")} />
              Pending
            </label>
            <label className={`chip ${statusFilters.Declined ? "on" : "off"}`}>
              <input type="checkbox" checked={statusFilters.Declined} onChange={() => toggleFilter("Declined")} />
              Declined
            </label>
            <label className={`chip ${statusFilters.Completed ? "on" : "off"}`}>
              <input type="checkbox" checked={statusFilters.Completed} onChange={() => toggleFilter("Completed")} />
              Completed
            </label>
          </div>
        </div>
        {notice ? <div className="toast">{notice}</div> : null}
        {error && <div className="error-message">{error}</div>}
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Image</th>
                <th>Qty</th>
                <th>Item Price</th>
                <th>Order Total</th>
                <th>Payment</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedOrders.length > 0 ? (
                filteredAndSortedOrders.flatMap((order) => {
                  const items = order.items || [];
                  if (items.length === 0) {
                    return (
                      <tr key={`${order.id}-empty`} className="order-row" onClick={() => handleRowClick(order)}>
                        <td>{order.id}</td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleString() : ""}</td>
                        <td>{order.email || ""}</td>
                        <td colSpan={3}>No items</td>
                        <td></td>
                        <td>{toMoney(order.total_amount, order.currency)}</td>
                        <td>{displayPayment(order)}</td>
                        <td>
                          <span className={`badge ${getEffectiveStatus(order).toLowerCase() === "completed" ? "order-completed" : getEffectiveStatus(order).toLowerCase()}`}>{displayDecision(order)}</span>
                        </td>
                      </tr>
                    );
                  }
                  return items.map((it, idx) => (
                    <tr key={`${order.id}-${idx}`} className="order-row" onClick={() => handleRowClick(order)}>
                      <td>{idx === 0 ? order.id : ""}</td>
                      <td>{idx === 0 ? (order.created_at ? new Date(order.created_at).toLocaleString() : "") : ""}</td>
                      <td>{idx === 0 ? (order.email || "") : ""}</td>
                      <td>{it.product_name || ""}</td>
                      <td>{it.image_url && <img src={it.image_url} alt={it.product_name || "item"} className="thumbnail" />}</td>
                      <td>{it.quantity ?? ""}</td>
                      <td>{priceItem(it.unit_price_minor)}</td>
                      <td>{idx === 0 ? toMoney(order.total_amount, order.currency) : ""}</td>
                      <td>{idx === 0 ? displayPayment(order) : ""}</td>
                      <td>
                        {idx === 0 ? (
                          <span className={`badge ${getEffectiveStatus(order).toLowerCase() === "completed" ? "order-completed" : getEffectiveStatus(order).toLowerCase()}`}>
                            {displayDecision(order)}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ));
                })
              ) : (
                <tr>
                  <td colSpan={10}>No orders available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Order Details</div>
              <button className="icon-btn" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="order-summary">
                <div className="summary-row"><span>Order ID</span><strong>{selectedOrder.id}</strong></div>
                <div className="summary-row"><span>Date</span><strong>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : ""}</strong></div>
                <div className="summary-row"><span>Email</span><strong>{selectedOrder.email || ""}</strong></div>
                <div className="summary-row"><span>Customer Type</span><strong className={`pill ${getCustomerType(selectedOrder) === "B2B" ? "b2b" : "b2c"}`}>{getCustomerType(selectedOrder)}</strong></div>
                <div className="summary-row"><span>Total</span><strong>{toMoney(selectedOrder.total_amount, selectedOrder.currency)}</strong></div>
                <div className="summary-row"><span>Payment</span><strong>{displayPayment(selectedOrder)}</strong></div>
              </div>

              <div className="address-block">
                <div className="block-title">Shipping Address</div>
                <div className="address-text">{(() => { const addr = extractAddress(selectedOrder); const text = formatAddress(addr); return text || "No address available"; })()}</div>
                <div className="address-meta">
                  {(() => {
                    const a = extractAddress(selectedOrder);
                    return (
                      <>
                        {a.phone ? <span>Phone: {a.phone}</span> : null}
                        {a.postal_code ? <span>Pincode: {a.postal_code}</span> : null}
                        {a.country ? <span>Country: {a.country}</span> : null}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="items-block">
                <div className="block-title">Items</div>
                <div className="items-list">
                  {(selectedOrder.items || []).map((it, i) => (
                    <div className="item-card" key={i}>
                      <div className="item-left">{it.image_url ? <img src={it.image_url} alt={it.product_name || "item"} /> : <div className="img-fallback">No Image</div>}</div>
                      <div className="item-right">
                        <div className="item-name">{it.product_name || "Product"}</div>
                        <div className="item-meta">
                          <span>Qty: {it.quantity || 0}</span>
                          <span>{priceItem(it.unit_price_minor)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(selectedOrder.items || []).length === 0 && <div className="empty-items">No items for this order</div>}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="left-note">
                {completed[selectedOrder.id] || (selectedOrder.fulfill_status || "").toLowerCase() === "completed" ? (
                  <span className="status-note completed">Order completed</span>
                ) : decisions[selectedOrder.id] === "Accepted" || selectedOrder.decision_status === "Accepted" ? (
                  <div className="complete-wrap">
                    <span className="question">Is the order completed?</span>
                    <button
                      className="btn complete"
                      onClick={(e) => { e.stopPropagation(); completeOrder(selectedOrder.id); }}
                      disabled={!!saving[selectedOrder.id]}
                    >
                      Yes completed
                    </button>
                  </div>
                ) : decisions[selectedOrder.id] === "Declined" || selectedOrder.decision_status === "Declined" ? (
                  <span className="status-note declined">Marked as Declined</span>
                ) : (
                  <span className="status-note hidden-text"></span>
                )}
              </div>
              <div className="actions">
                {decisions[selectedOrder.id] === "Accepted" || selectedOrder.decision_status === "Accepted" ? null : (
                  <>
                    <button
                      className="btn decline"
                      onClick={(e) => { e.stopPropagation(); declineOrder(selectedOrder.id); }}
                      disabled={decisions[selectedOrder.id] === "Declined" || selectedOrder.decision_status === "Declined" || !!saving[selectedOrder.id]}
                    >
                      {saving[selectedOrder.id] && decisions[selectedOrder.id] !== "Accepted" ? "Saving..." : "Decline"}
                    </button>
                    <button
                      className="btn accept"
                      onClick={(e) => { e.stopPropagation(); acceptOrder(selectedOrder.id); }}
                      disabled={decisions[selectedOrder.id] === "Accepted" || selectedOrder.decision_status === "Accepted" || !!saving[selectedOrder.id]}
                    >
                      {saving[selectedOrder.id] && decisions[selectedOrder.id] !== "Declined" ? "Saving..." : "Accept"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;
