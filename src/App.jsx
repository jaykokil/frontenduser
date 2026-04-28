import React, { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://backend-all-tgww.onrender.com/api";

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("inventory_user") || "null"); } catch { return null; }
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error("Backend not reachable. Check backend URL / VITE_API_URL.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Server error: ${response.status}`);
  return data;
}

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

function Button({ children, variant = "primary", ...props }) {
  return <button className={`btn ${variant}`} {...props}>{children}</button>;
}
function Card({ children, className = "", onClick }) {
  return <div className={`card ${className}`} onClick={onClick}>{children}</div>;
}
function SelectBox({ value, onChange, children, disabled }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>{children}</select>;
}
function StatCard({ title, value, sub, icon, children }) {
  return <Card><div className="stat"><div><p className="muted">{title}</p><h2>{value}</h2>{sub && <p className="small">{sub}</p>}{children}</div><div className="statIcon">{icon}</div></div></Card>;
}


function MachineStatusCard({ onBarcodeDetected, onWeightDetected, currentWeight }) {
  const scannerInputRef = useRef(null);
  const barcodeTimerRef = useRef(null);
  const [scaleStatus, setScaleStatus] = useState("Disconnected");
  const [scannerStatus, setScannerStatus] = useState("Disconnected");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [isListening, setIsListening] = useState(false);

  async function connectDevices() {
    setScannerStatus("Ready");
    setIsListening(true);
    setTimeout(() => scannerInputRef.current?.focus(), 100);

    try {
      if (!("serial" in navigator)) {
        setScaleStatus("Not Supported");
        alert("Use Chrome or Edge. Web Serial is not supported in this browser.");
        return;
      }

      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none"
      });

      setScaleStatus("Connected");
      readWeight(selectedPort);
    } catch (error) {
      console.error(error);
      setScaleStatus("Connection Failed");
    }
  }

  async function readWeight(selectedPort) {
    try {
      const decoder = new TextDecoderStream();
      selectedPort.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        const match = buffer.match(/-?\d+(\.\d+)?/);
        if (match) {
          const cleanWeight = Math.round(Number(match[0]));
          onWeightDetected(cleanWeight);
          buffer = "";
        }
      }
    } catch (error) {
      console.error(error);
      setScaleStatus("Reading Stopped");
    }
  }

  function processBarcode(code) {
    const cleanCode = String(code || "").trim();
    if (!cleanCode) return;
    setScannerStatus("Scanned");
    onBarcodeDetected(cleanCode);
    setBarcodeValue("");
    setTimeout(() => scannerInputRef.current?.focus(), 100);
  }

  function handleScannerInput(value) {
    setBarcodeValue(value);
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    barcodeTimerRef.current = setTimeout(() => processBarcode(value), 120);
  }

  function handleScannerKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      processBarcode(barcodeValue);
    }
  }

  useEffect(() => {
    function keepScannerFocused() {
      if (isListening) scannerInputRef.current?.focus();
    }
    window.addEventListener("click", keepScannerFocused);
    return () => window.removeEventListener("click", keepScannerFocused);
  }, [isListening]);

  return (
    <StatCard title="Device Status" value={scaleStatus} sub={`scanner: ${scannerStatus}`} icon="📡">
      <Button className="deviceBtn" onClick={connectDevices}>Connect Device</Button>
      <p className="small" style={{ marginTop: 8 }}>Weight: {currentWeight ? `${currentWeight} G` : "--"}</p>
      <input
        ref={scannerInputRef}
        value={barcodeValue}
        onChange={(e) => handleScannerInput(e.target.value)}
        onKeyDown={handleScannerKeyDown}
        autoComplete="off"
        aria-label="Barcode scanner capture"
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
      />
    </StatCard>
  );
}


function ProductSearch({ products, value, onChange, onPick }) {
  const results = useMemo(() => {
    const q = value.toLowerCase().trim();
    if (!q) return [];
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.productCode.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [products, value]);
  return (
    <div className="searchBox">
      <input placeholder="Search brand name manually" value={value} onChange={(e) => onChange(e.target.value)} />
      {results.length > 0 && (
        <div className="suggestions">
          {results.map((p) => (
            <button key={p.id} onClick={() => onPick(p)}>
              <b>{p.name}</b><span>{p.category} • {p.bottleSizeMl} ML</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryReading({ disabled, row, products, brandSearch, setBrandSearch, onPickProduct, closingFullBottle, setClosingFullBottle, closingEmptyBottle, setClosingEmptyBottle, closingOpenBottleMl, setClosingOpenBottleMl, onSave }) {
  const active = !!row;
  return (
    <div className={`reading ${disabled ? "disabled" : ""}`}>
      <div className="readingTop">
        <div className="brandBlock">
          <p className="muted">Brand Name</p>
          <ProductSearch products={products} value={brandSearch} onChange={setBrandSearch} onPick={onPickProduct} />
          <p className="muted">{active ? `${row.category} • ${row.bottleSize} ML` : "Select or scan a product"}</p>
        </div>
        <div className="readingRight">
          <Button variant="secondary">Read Again</Button>
          <div className="currentReading">
            <p className="muted">Current Reading</p>
            <p className="small">REMAINING</p>
            <h2>{active ? `${row.closingOpenBottleRemainingMl || 0} ML` : "--/--"}</h2>
          </div>
        </div>
      </div>
      <div className="readingGrid">
        <div className="mini"><p>OPENING FULL BOTTLES</p><h2>{active ? row.openingFullBottleCount : "-"}</h2></div>
        <div className="mini"><p>OPENING OPEN BOTTLE ML</p><h2>{active ? row.openingOpenBottleRemainingMl : "-"}</h2></div>
        <div className="mini"><p>CLOSING FULL BOTTLES</p><input value={closingFullBottle} onChange={(e) => setClosingFullBottle(e.target.value)} placeholder="Type full bottles" /></div>
        <div className="mini"><p>CLOSING EMPTY BOTTLES</p><input value={closingEmptyBottle} onChange={(e) => setClosingEmptyBottle(e.target.value)} placeholder="Type empty bottles" /></div>
        <div className="mini wide"><p>CLOSING OPEN BOTTLE ML</p><input value={closingOpenBottleMl} onChange={(e) => setClosingOpenBottleMl(e.target.value)} placeholder="Type open bottle ML" /></div>
      </div>
      <div className="rowButtons">
        <Button onClick={onSave}>Save Closing</Button>
        <Button variant="secondary">Read Next Bottle</Button>
        <Button variant="secondary">Update Indent</Button>
      </div>
    </div>
  );
}

function InventoryTable({ rows, isStockRoom }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Product ID</th><th>Brand Name</th><th>Category</th><th>Bottle Size</th><th>Cost</th>
            {isStockRoom ? <><th>Total Full Bottle</th><th>Total Open Bottle</th><th>Stock Value</th></> : <><th>Total Full Bottle</th><th>Total Open Bottle</th><th>Stock Value</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan="8" className="emptyCell">No inventory history yet.</td></tr> : rows.map((r) => {
            const full = r.totalFullBottle ?? r.closingFullBottleCount ?? r.openingFullBottleCount ?? 0;
            const open = r.totalOpenBottle ?? r.closingOpenBottleRemainingMl ?? r.openingOpenBottleRemainingMl ?? 0;
            return <tr key={r.id}><td>{r.productCode}</td><td>{r.name}</td><td>{r.category}</td><td>{r.bottleSize}</td><td>{r.costOfBottle}</td><td>{full}</td><td>{open}</td><td>{Number(full || 0) * Number(r.costOfBottle || 0)}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("skyline");
  const [password, setPassword] = useState("1234");
  const [message, setMessage] = useState("Use skyline / 1234");
  async function submit(e) { e.preventDefault(); const result = await onLogin(username.trim(), password.trim()); if (!result.ok) setMessage(result.message || "Login failed"); }
  return (
    <div className="loginPage">
      <div className="hero"><span className="pill">Inventory Platform</span><h1>Outlet-first hospitality inventory system</h1><p>Outlet, bar, stock room, transfer and closing inventory.</p></div>
      <Card className="loginCard"><h2>Login</h2><p className="muted">Login</p><form onSubmit={submit}><div className="field"><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} /></div><div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><Button type="submit">Continue</Button></form><div className="note">{message}</div></Card>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => {
    const user = getStoredUser();
    return user ? { type: "user", userId: user.id || "local-user" } : null;
  });

  async function login(username, password) {
    const user = {
      id: "local-user",
      username: username || "user",
      name: username || "User",
    };

    localStorage.setItem("inventory_user", JSON.stringify(user));
    setSession({ type: "user", userId: user.id });

    return { ok: true };
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("inventory_user");
    setSession(null);
  }

  if (!session) return <Login onLogin={login} />;
  return <Dashboard onLogout={logout} />;
}

function Dashboard({ onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [outlets, setOutlets] = useState([]);
  const [bars, setBars] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [selectedBarId, setSelectedBarId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [closingFullBottle, setClosingFullBottle] = useState("");
  const [closingEmptyBottle, setClosingEmptyBottle] = useState("");
  const [closingOpenBottleMl, setClosingOpenBottleMl] = useState("");
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState([]);
  const [drillOutletId, setDrillOutletId] = useState("");
  const [drillBarId, setDrillBarId] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [lastBarcode, setLastBarcode] = useState("");

  const storedUser = getStoredUser();
  const currentUserName = storedUser?.businessName || storedUser?.name || "Inventory User";
  const currentOwnerName = storedUser?.ownerName || storedUser?.username || "";
  const selectedBar = bars.find((b) => b.id === selectedBarId);
  const isStockRoom = String(selectedBar?.type || "").includes("stock");
  const activeRows = rows.filter((r) => r.outletId === selectedOutletId && r.barId === selectedBarId);
  const latestRow = activeRows.find((r) => r.productId === selectedProductId) || activeRows[0];

  function handleBarcodeDetected(code) {
    setLastBarcode(code);
    const product = products.find((p) =>
      String(p.productCode || "").trim() === String(code).trim() ||
      String(p.barcode || "").trim() === String(code).trim()
    );

    if (!product) {
      setStatus(`Barcode scanned: ${code}. Product not found in database.`);
      setBrandSearch(code);
      return;
    }

    setSelectedProductId(product.id);
    setBrandSearch(product.name);
    setStatus(`Barcode scanned: ${product.name}`);
  }

  useEffect(() => {
    if (!selectedProductId || !currentWeight) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const bottleSize = Number(product.bottleSizeMl || product.bottleSize || 750);
    const emptyBottleWeight = Number(product.emptyBottleWeightG || product.emptyBottleWeight || 400);
    const remaining = Math.max(0, Math.min(bottleSize, Math.round(Number(currentWeight) - emptyBottleWeight)));
    setClosingOpenBottleMl(String(remaining));
  }, [selectedProductId, currentWeight, products]);

  useEffect(() => { apiRequest("/outlets").then(setOutlets).catch((e) => setStatus(e.message)); apiRequest("/products").then(setProducts).catch((e) => setStatus(e.message)); loadHistory(); }, []);

  useEffect(() => {
    if (!selectedOutletId) { setBars([]); setSelectedBarId(""); return; }
    apiRequest(`/bars/outlet/${selectedOutletId}`).then((data) => setBars(data)).catch((e) => setStatus(e.message));
  }, [selectedOutletId]);

  useEffect(() => { if (selectedOutletId && selectedBarId) loadInventory(selectedOutletId, selectedBarId); }, [selectedOutletId, selectedBarId]);

  function rowFromInventory(entry, product) {
    return { id: entry.id, outletId: entry.outletId || selectedOutletId, barId: entry.barId || selectedBarId, productId: product.id, productCode: product.productCode, name: product.name, category: product.category, bottleSize: product.bottleSizeMl || entry.bottleSize, costOfBottle: product.costOfBottle || entry.costOfBottle, openingFullBottleCount: entry.openingFullBottle || entry.openingFullBottleCount || 0, openingOpenBottleRemainingMl: entry.openingOpenBottleMl || entry.openingOpenBottle || 0, closingFullBottleCount: entry.closingFullBottle || entry.closingFullBottleCount || 0, closingOpenBottleRemainingMl: entry.closingOpenBottleMl || entry.closingOpenBottle || 0, totalOpenBottle: entry.totalOpenBottle, totalFullBottle: entry.totalFullBottle };
  }
  function normalizeReportRow(r) { return { id: r.id, outletId: r.outletId, barId: r.barId, productId: r.productId, productCode: r.productCode, name: r.name, category: r.category, bottleSize: r.bottleSize, costOfBottle: r.costOfBottle, openingFullBottleCount: r.openingFullBottle || 0, openingOpenBottleRemainingMl: r.openingOpenBottle || 0, closingFullBottleCount: r.closingFullBottle || r.totalFullBottle || 0, closingOpenBottleRemainingMl: r.closingOpenBottle || r.totalOpenBottle || 0, totalFullBottle: r.totalFullBottle, totalOpenBottle: r.totalOpenBottle, stockValue: r.stockValue }; }
  async function loadInventory(outletId, barId) {
    const b = bars.find((x) => x.id === barId);
    const endpoint = String(b?.type || "").includes("stock") ? `/reports/stock-room?outletId=${outletId}&barId=${barId}` : `/reports/bar?outletId=${outletId}&barId=${barId}`;
    try { const data = await apiRequest(endpoint); setRows((prev) => [...prev.filter((r) => !(r.outletId === outletId && r.barId === barId)), ...data.map(normalizeReportRow)]); } catch (e) { setStatus(e.message); }
  }
  function upsertRow(row) { setRows((prev) => { const existing = prev.findIndex((r) => r.barId === row.barId && r.productCode === row.productCode); if (existing >= 0) { const copy = [...prev]; copy[existing] = row; return copy; } return [row, ...prev]; }); }
  function pickProduct(p) { setSelectedProductId(p.id); setBrandSearch(p.name); }
  async function saveManualClosing() {
    if (!selectedBarId || !selectedProductId) return setStatus("Select bar/stock room and brand name first.");
    try {
      const product = products.find((p) => p.id === selectedProductId);
      const entry = await apiRequest("/inventory/manual-entry", { method: "POST", body: JSON.stringify({ barId: selectedBarId, productId: selectedProductId, closingFullBottle: Number(closingFullBottle || 0), emptyBottleCount: Number(closingEmptyBottle || 0), remainingMl: Number(closingOpenBottleMl || 0), businessDate: new Date().toISOString() }) });
      upsertRow(rowFromInventory(entry, product));
      setClosingFullBottle(""); setClosingEmptyBottle(""); setClosingOpenBottleMl("");
      setStatus("Manual inventory saved in existing columns.");
      loadHistory();
    } catch (e) { setStatus(e.message); }
  }
  async function loadHistory(filters = {}) { try { const qs = new URLSearchParams(filters).toString(); const data = await apiRequest(`/history${qs ? `?${qs}` : ""}`); setHistory(data); } catch (e) { setStatus(e.message); } }
  function exportCsv(customRows = activeRows) {
    const header = ["Product ID", "Brand Name", "Category", "Bottle Size", "Cost", "Total Full Bottle", "Total Open Bottle", "Stock Value"];
    const body = customRows.map((r) => { const full = r.totalFullBottle ?? r.closingFullBottleCount ?? r.openingFullBottleCount ?? 0; const open = r.totalOpenBottle ?? r.closingOpenBottleRemainingMl ?? r.openingOpenBottleRemainingMl ?? 0; return [r.productCode, r.name, r.category, r.bottleSize, r.costOfBottle, full, open, Number(full || 0) * Number(r.costOfBottle || 0)]; });
    const csv = [header, ...body].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "inventory_export.csv"; link.click();
  }

  async function openOutlet(outlet) { setDrillOutletId(outlet.id); setDrillBarId(""); setSelectedOutletId(outlet.id); try { const data = await apiRequest(`/bars/outlet/${outlet.id}`); setBars(data); } catch (e) { setStatus(e.message); } }
  async function openBar(barObj) { setDrillBarId(barObj.id); setSelectedBarId(barObj.id); await loadInventory(drillOutletId || selectedOutletId, barObj.id); }
  const drillOutlet = outlets.find((o) => o.id === drillOutletId);
  const drillBar = bars.find((b) => b.id === drillBarId);
  const drillRows = rows.filter((r) => r.outletId === drillOutletId && r.barId === drillBarId);

  return (
    <div className="app">
      <header><div><p className="muted">User Interface</p><h1>{currentUserName}</h1><p className="muted">{currentOwnerName}</p></div><nav>{["dashboard", "outlet", "report", "history"].map((item) => <Button key={item} variant={page === item ? "primary" : "secondary"} onClick={() => setPage(item)}>{cap(item)}</Button>)}<Button variant="secondary" onClick={onLogout}>Logout</Button></nav></header>
      <main>
        {status ? <div className="alert">{status}</div> : null}
        {page === "dashboard" && <>
          <section className="stats"><StatCard title="Restaurant / Bar" value={currentUserName} sub={currentOwnerName} icon="🏢" /><MachineStatusCard onBarcodeDetected={handleBarcodeDetected} onWeightDetected={setCurrentWeight} currentWeight={currentWeight} /></section>
          <Card>
            <div className="cardHead inventoryHead"><div><h2>Inventory</h2><p className="muted">Select outlet and bar to take inventory. Scan barcode + read weight, or manually type closing values in the same section.</p></div><div className="filters compactFilters"><SelectBox value={selectedOutletId} onChange={(value) => { setSelectedOutletId(value); setSelectedBarId(""); }}><option value="">Select outlet</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectBox><SelectBox value={selectedBarId} onChange={setSelectedBarId} disabled={!selectedOutletId}><option value="">Select bar or stock room</option>{bars.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectBox></div></div>
            <InventoryReading disabled={!selectedOutletId || !selectedBarId} row={latestRow} products={products} brandSearch={brandSearch} setBrandSearch={setBrandSearch} onPickProduct={pickProduct} closingFullBottle={closingFullBottle} setClosingFullBottle={setClosingFullBottle} closingEmptyBottle={closingEmptyBottle} setClosingEmptyBottle={setClosingEmptyBottle} closingOpenBottleMl={closingOpenBottleMl} setClosingOpenBottleMl={setClosingOpenBottleMl} onSave={saveManualClosing} />
            <section className="historyPanel"><div className="cardHead"><div><h2>Scanned Item History</h2><p className="muted">Latest scan, manual inventory, assign, transfer and closing activities.</p></div><Button variant="secondary" onClick={() => loadHistory()}>Refresh History</Button></div><div className="history">{history.slice(0, 10).map((h) => <div className="historyItem" key={h.id}><b>{h.action}</b><span>{h.message}</span><small>{h.createdAt}</small></div>)}</div></section>
          </Card>
        </>}

        {page === "outlet" && <div><div className="cardHead"><div><h2>Outlets</h2><p className="muted">Click an outlet card, then click stock room, sky bar or low bar to view stock history.</p></div></div>{!drillOutletId && <div className="outletGrid">{outlets.map((outlet) => <Card key={outlet.id} className="clickCard" onClick={() => openOutlet(outlet)}><h3>{outlet.name}</h3><p className="muted">Click to open outlet</p></Card>)}</div>}{drillOutletId && !drillBarId && <><Button variant="secondary" onClick={() => setDrillOutletId("")}>← Back to outlets</Button><h2 className="sectionTitle">{drillOutlet?.name}</h2><div className="outletGrid">{bars.filter((b) => b.outletId === drillOutletId).map((b) => <Card key={b.id} className="clickCard" onClick={() => openBar(b)}><h3>{b.name}</h3><p className="muted">{String(b.type).includes("stock") ? "Stock Room" : "Bar"}</p></Card>)}</div></>}{drillOutletId && drillBarId && <Card><div className="barPageHead"><div><Button variant="secondary" onClick={() => setDrillBarId("")}>← Back</Button><h2>Stock in the bar</h2><p className="muted">{drillOutlet?.name} • {drillBar?.name}</p></div><div className="actionBtns"><Button variant="secondary">Assign</Button><Button variant="secondary">Transfer</Button><Button onClick={() => exportCsv(drillRows)}>Export</Button></div></div><InventoryTable rows={drillRows} isStockRoom={String(drillBar?.type || "").includes("stock")} /></Card>}</div>}

        {page === "report" && <Card><h2>Report</h2><div className="filters"><SelectBox value={selectedOutletId} onChange={setSelectedOutletId}><option value="">Select outlet</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectBox><SelectBox value={selectedBarId} onChange={setSelectedBarId}><option value="">Select bar</option>{bars.filter((b) => b.outletId === selectedOutletId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectBox><Button onClick={() => exportCsv()}>Export Inventory</Button></div><InventoryTable rows={activeRows} isStockRoom={isStockRoom} /></Card>}

        {page === "history" && <Card><div className="cardHead"><div><h2>History</h2><p className="muted">Activity logs from backend.</p></div><Button onClick={() => loadHistory()}>Load History</Button></div><div className="history">{history.map((h) => <div className="historyItem" key={h.id}><b>{h.action}</b><span>{h.message}</span><small>{h.createdAt}</small></div>)}</div></Card>}
      </main>
    </div>
  );
}
