import React, { useEffect, useMemo, useState } from "react";
import "./Subscriber.css";
import AdminNavbar from './AdminNavbar';

const BASE_URL = "https://mahaveerpapersbe.vercel.app";

export default function Subscriber() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [gstFilter, setGstFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) setRows(data.users);
      else setRows([]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const normalized = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.map((r) => ({
      id: r.id,
      name: r.name || "",
      email: r.email || "",
      user_type: r.user_type || "b2c",
      gst_number: r.gst_number || "",
      gst_verified: Boolean(r.gst_verified),
      created_at: r.created_at || r.createdAt || null,
    }));
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.gst_number.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      list = list.filter((r) => r.user_type === typeFilter);
    }
    if (gstFilter !== "all") {
      if (gstFilter === "with") list = list.filter((r) => r.gst_number);
      if (gstFilter === "without") list = list.filter((r) => !r.gst_number);
      if (gstFilter === "verified") list = list.filter((r) => r.gst_verified === true);
      if (gstFilter === "pending") list = list.filter((r) => r.gst_number && r.gst_verified !== true);
    }
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "name") return a.name.localeCompare(b.name) * dir;
      if (sortBy === "email") return a.email.localeCompare(b.email) * dir;
      if (sortBy === "type") return a.user_type.localeCompare(b.user_type) * dir;
      if (sortBy === "gst") return a.gst_number.localeCompare(b.gst_number) * dir;
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return (da - db) * dir;
    });
    return list;
  }, [rows, query, typeFilter, gstFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(normalized.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return normalized.slice(start, start + pageSize);
  }, [normalized, page, pageSize]);

  const notify = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const updateType = async (id, toType) => {
    const old = rows.slice();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const optimistic = rows.slice();
    optimistic[idx] = {
      ...optimistic[idx],
      user_type: toType,
      gst_verified: toType === "b2b" ? true : false,
    };
    setRows(optimistic);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/${id}/type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType: toType, gstVerified: toType === "b2b" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows(old);
        notify("error", data.error || "Update failed");
      } else {
        notify("success", "Saved");
      }
    } catch {
      setRows(old);
      notify("error", "Network error");
    }
  };

  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "email", label: "Email", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "gst", label: "GST Number", sortable: true },
    { key: "gst_status", label: "GST Status", sortable: false },
    { key: "created_at", label: "Joined", sortable: true },
    { key: "actions", label: "Validate", sortable: false },
  ];

  return (
    <div className="subscriber-page">
      <AdminNavbar />
    <div className="subs-wrap">
      
      <div className="subs-header">
        <div className="subs-title">
          <h1>Users</h1>
          <p>Review signups, validate GST, and manage account type</p>
        </div>
        <div className="subs-actions">
          <button className={`btn ${refreshing ? "btn-disabled" : "btn-primary"}`} onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="subs-toolbar">
        <div className="subs-search">
          <input
            placeholder="Search name, email, GST..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="subs-filters">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
          </select>
          <select value={gstFilter} onChange={(e) => setGstFilter(e.target.value)}>
            <option value="all">All GST</option>
            <option value="with">With GST</option>
            <option value="without">Without GST</option>
            <option value="verified">GST Verified</option>
            <option value="pending">GST Pending</option>
          </select>
          <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value, 10))}>
            <option value={5}>5 / page</option>
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      </div>

      <div className="subs-table-card">
        <div className="subs-table-scroll">
          <table className="subs-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => {
                      if (!c.sortable) return;
                      if (c.key === "type") setSortBy("type");
                      else if (c.key === "gst") setSortBy("gst");
                      else setSortBy(c.key);
                      setSortDir((d) => (sortBy === c.key ? (d === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    className={c.sortable ? "sortable" : ""}
                  >
                    {c.label}
                    {c.sortable && sortBy === (c.key === "type" ? "type" : c.key === "gst" ? "gst" : c.key) && (
                      <span className="sort-ind">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr className="skeleton" key={i}>
                    <td><div className="sk-line w-60" /></td>
                    <td><div className="sk-line w-72" /></td>
                    <td><div className="sk-pill w-16" /></td>
                    <td><div className="sk-line w-52" /></td>
                    <td><div className="sk-pill w-28" /></td>
                    <td><div className="sk-line w-32" /></td>
                    <td><div className="sk-btns" /></td>
                  </tr>
                ))
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="empty">
                    No users found
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-main">
                        <div className="avatar">{(r.name || r.email).slice(0, 1).toUpperCase()}</div>
                        <div className="cell-text">
                          <div className="cell-title">{r.name || "—"}</div>
                          <button
                            className="cell-sub copy"
                            onClick={() => {
                              navigator.clipboard.writeText(r.email || "");
                              notify("info", "Email copied");
                            }}
                            title="Copy email"
                          >
                            {r.email || "—"}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="hide-md">
                      <span className="mono">{r.email || "—"}</span>
                    </td>
                    <td>
                      <span className={`pill ${r.user_type === "b2b" ? "pill-b2b" : "pill-b2c"}`}>
                        {r.user_type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {r.gst_number ? (
                        <span className="mono gst">{r.gst_number}</span>
                      ) : (
                        <span className="muted">No GST</span>
                      )}
                    </td>
                    <td>
                      {r.gst_number ? (
                        r.gst_verified ? (
                          <span className="status status-good">Verified</span>
                        ) : (
                          <span className="status status-warn">Pending</span>
                        )
                      ) : (
                        <span className="status status-muted">N/A</span>
                      )}
                    </td>
                    <td className="hide-sm">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-yes"
                          disabled={!r.gst_number || r.user_type === "b2b"}
                          onClick={() => updateType(r.id, "b2b")}
                          title="Mark GST valid and set as B2B"
                        >
                          Yes
                        </button>
                        <button
                          className="btn btn-no"
                          disabled={r.user_type === "b2c"}
                          onClick={() => updateType(r.id, "b2c")}
                          title="GST invalid, set as B2C"
                        >
                          No
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="subs-footer">
          <div className="subs-count">
            Showing <b>{paged.length}</b> of <b>{normalized.length}</b>
          </div>
          <div className="subs-pager">
            <button className="btn" onClick={() => setPage(1)} disabled={page === 1}>
              «
            </button>
            <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ‹
            </button>
            <span className="pager-page">
              Page {page} of {totalPages}
            </span>
            <button className="btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              ›
            </button>
            <button className="btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              »
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
    </div>
  );
}
