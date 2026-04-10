import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './AddBulkProduct.css';
import AdminNavbar from './AdminNavbar';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

const PRODUCT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'model_name', label: 'Model Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'hsn_code', label: 'HSN Code' },
  { key: 'hsn_percentage', label: 'HSN %' },
  { key: 'mrp', label: 'MRP' },
  { key: 'mahaveer_price', label: 'Mahaveer Price' },
  { key: 'discount_b2b', label: 'Discount B2B %' },
  { key: 'discount_b2c', label: 'Discount B2C %' },
  { key: 'weight', label: 'Weight' },
  { key: 'length', label: 'Length' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'description', label: 'Description' },
  { key: 'imageUrls', label: 'Image URLs' },
];

const normalize = (v) =>
  String(v || '')
    .toLowerCase()
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const toText = (v) => String(v ?? '').trim();

const toNumberString = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? String(n) : '';
};

const toPctString = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return '';
  const pct = n <= 1 ? n * 100 : n;
  return String(Math.max(0, Math.min(100, pct)));
};

const isEmptyRow = (row) =>
  Object.values(row || {}).every((v) => String(v ?? '').trim() === '');

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const defaultHeaderForField = (headers, field) => {
  const findAny = (...names) => {
    const lower = headers.map((h) => ({ raw: h, key: String(h).trim().toLowerCase() }));
    for (const name of names) {
      const hit = lower.find((x) => x.key === name.toLowerCase());
      if (hit) return hit.raw;
    }
    for (const name of names) {
      const hit = lower.find((x) => x.key.includes(name.toLowerCase()));
      if (hit) return hit.raw;
    }
    return '';
  };

  switch (field) {
    case 'name':
      return findAny('ITEM NAME', 'PRODUCT NAME', 'NAME');
    case 'model_name':
      return findAny('ITEM CODE', 'MODEL NAME', 'CODE', 'SKU');
    case 'brand':
      return findAny('BRAND');
    case 'hsn_code':
      return findAny('HSN CODE', 'HSN');
    case 'hsn_percentage':
      return findAny('PERCENTAGE', 'GST %', 'GST PERCENTAGE', 'HSN PERCENTAGE');
    case 'mrp':
      return findAny('MRP');
    case 'mahaveer_price':
      return findAny('SALES RATE', 'SELLING RATE', 'S. RATE', 'W.S  RATE', 'W.S RATE', 'PURCHASE RATE', 'P RATE', 'P  RATE');
    case 'discount_b2b':
      return findAny('DISCOUNT B2B', 'B2B DISCOUNT');
    case 'discount_b2c':
      return findAny('DISCOUNT B2C', 'B2C DISCOUNT');
    case 'weight':
      return findAny('WEIGHT', 'REAM WEIGHT IN KG');
    case 'length':
      return findAny('LENGTH');
    case 'width':
      return findAny('WIDTH');
    case 'height':
      return findAny('HEIGHT');
    case 'description':
      return findAny('DESCRIPTION', 'ITEM NAME');
    case 'imageUrls':
      return findAny('PHOTO', 'IMAGE', 'IMAGE URL', 'IMAGEURLS');
    default:
      return '';
  }
};

const buildDefaultMapping = (headers) => {
  const next = {};
  PRODUCT_FIELDS.forEach((field) => {
    next[field.key] = defaultHeaderForField(headers, field.key);
  });
  return next;
};

const findNodeBySlugKey = (nodes, key) => {
  for (const n of nodes) {
    if (n.slugKey === key) return n;
    if (n.submenu) {
      const found = findNodeBySlugKey(n.submenu, key);
      if (found) return found;
    }
  }
  return null;
};

function AddBulkProduct() {
  const workbookDataRef = useRef([]);
  const excelInputRef = useRef(null);
  const zipInputRef = useRef(null);

  const [navTree, setNavTree] = useState([]);
  const [sheetSummaries, setSheetSummaries] = useState([]);
  const [availableHeaders, setAvailableHeaders] = useState([]);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [mapping, setMapping] = useState({});
  const [message, setMessage] = useState('');
  const [published, setPublished] = useState(true);
  const [mode, setMode] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [categorySource, setCategorySource] = useState('sheet');
  const [fixedCategorySlug, setFixedCategorySlug] = useState('');
  const [importing, setImporting] = useState(false);
  const [zipUploading, setZipUploading] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0, success: 0, failed: 0 });
  const [previewRows, setPreviewRows] = useState([]);
  const [zipSummary, setZipSummary] = useState({ uploadedCount: 0, linkedProducts: 0, skippedCount: 0 });
  const [selectedExcelFile, setSelectedExcelFile] = useState(null);
  const [selectedZipFile, setSelectedZipFile] = useState(null);

  useEffect(() => {
    const fetchNav = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/navlinks?t=${Date.now()}`);
        const menu = await res.json();
        setNavTree(Array.isArray(menu) ? menu : []);
      } catch {
        setNavTree([]);
      }
    };
    fetchNav();
  }, []);

  const selectedSheetSummaries = useMemo(
    () => sheetSummaries.filter((sheet) => selectedSheets.includes(sheet.sheetName)),
    [sheetSummaries, selectedSheets]
  );

  const totalSelectedRows = useMemo(
    () => selectedSheetSummaries.reduce((sum, sheet) => sum + sheet.rowCount, 0),
    [selectedSheetSummaries]
  );

  const renderNavOptions = (nodes, prefix = '') =>
    nodes.map((n) => (
      <React.Fragment key={n.slugKey}>
        <option value={n.slugKey}>{prefix + n.title}</option>
        {Array.isArray(n.submenu) ? renderNavOptions(n.submenu, `${prefix}—`) : null}
      </React.Fragment>
    ));

  const handleExcelFileSelect = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedExcelFile(file);
    setMessage('');
  };

  const handleZipFileSelect = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedZipFile(file);
    setMessage('');
  };

  const handleWorkbookUpload = async () => {
    setMessage('');
    setPreviewRows([]);
    workbookDataRef.current = [];
    setSheetSummaries([]);
    setAvailableHeaders([]);
    setSelectedSheets([]);
    setMapping({});

    if (!selectedExcelFile) {
      setMessage('❌ Please choose an Excel file');
      return;
    }

    try {
      const buffer = await selectedExcelFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      const parsedSheets = workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }).filter((row) => !isEmptyRow(row));
        const headers = unique(
          rows.reduce((acc, row) => {
            Object.keys(row || {}).forEach((k) => acc.push(String(k)));
            return acc;
          }, [])
        );
        return {
          sheetName,
          headers,
          rows,
        };
      }).filter((sheet) => sheet.rows.length > 0);

      workbookDataRef.current = parsedSheets;

      const headers = unique(parsedSheets.flatMap((sheet) => sheet.headers));
      const defaultMapping = buildDefaultMapping(headers);

      setAvailableHeaders(headers);
      setMapping(defaultMapping);
      setSelectedSheets(parsedSheets.map((sheet) => sheet.sheetName));
      setSheetSummaries(
        parsedSheets.map((sheet) => ({
          sheetName: sheet.sheetName,
          headers: sheet.headers,
          rowCount: sheet.rows.length,
        }))
      );
      setPreviewRows(
        parsedSheets
          .flatMap((sheet) =>
            sheet.rows.slice(0, 2).map((row, idx) => ({
              id: `${sheet.sheetName}-${idx}`,
              sheetName: sheet.sheetName,
              row,
            }))
          )
          .slice(0, 8)
      );
      setMessage('✅ Excel uploaded successfully');
    } catch {
      setMessage('❌ Unable to read the Excel file');
    }
  };

  const handleMappingChange = (field, header) => {
    setMapping((prev) => ({ ...prev, [field]: header }));
  };

  const toggleSheet = (sheetName) => {
    setSelectedSheets((prev) =>
      prev.includes(sheetName) ? prev.filter((s) => s !== sheetName) : [...prev, sheetName]
    );
  };

  const resolveCategorySlug = (row, sheetName) => {
    if (categorySource === 'fixed') return normalize(fixedCategorySlug);
    if (categorySource === 'group') return normalize(row['GROUP NAME']);
    return normalize(sheetName);
  };

  const buildDescription = (row, mappedDescription, nameValue) => {
    const base = toText(mappedDescription);
    if (base) return base;

    const parts = [
      toText(row['GROUP NAME']),
      toText(row['COLOUR']),
      toText(row['UNIT']),
      toText(row['BARCODE']),
    ].filter(Boolean);

    if (parts.length) return parts.join(' | ');
    return toText(nameValue);
  };

  const buildProductPayload = (row, sheetName) => {
    const rawMrp = row[mapping.mrp] ?? '';
    const rawMahaveer = row[mapping.mahaveer_price] ?? rawMrp;
    const rawHsnPct = row[mapping.hsn_percentage] ?? '';
    const rawDescription = row[mapping.description] ?? '';
    const name = toText(row[mapping.name]);

    return {
      name,
      model_name: toText(row[mapping.model_name]),
      brand: toText(row[mapping.brand]),
      category_slug: resolveCategorySlug(row, sheetName),
      hsn_code: toText(row[mapping.hsn_code]).replace(/[^0-9A-Z]/gi, '').slice(0, 8),
      hsn_percentage: toPctString(rawHsnPct),
      mrp: toNumberString(rawMrp),
      mahaveer_price: toNumberString(rawMahaveer || rawMrp),
      price: toNumberString(rawMahaveer || rawMrp),
      discount_b2b: toPctString(row[mapping.discount_b2b]) || '0',
      discount_b2c: toPctString(row[mapping.discount_b2c]) || '0',
      weight: toNumberString(row[mapping.weight]),
      length: toNumberString(row[mapping.length]),
      width: toNumberString(row[mapping.width]),
      height: toNumberString(row[mapping.height]),
      description: buildDescription(row, rawDescription, name),
      imageUrls: toText(row[mapping.imageUrls]),
      published,
    };
  };

  const getImportRows = () => {
    const selectedData = workbookDataRef.current.filter((sheet) => selectedSheets.includes(sheet.sheetName));
    return selectedData
      .flatMap((sheet) =>
        sheet.rows.map((row) => ({
          sheetName: sheet.sheetName,
          row,
          payload: buildProductPayload(row, sheet.sheetName),
        }))
      )
      .filter((entry) => entry.payload.name && entry.payload.brand && entry.payload.category_slug && entry.payload.mahaveer_price);
  };

  const ensureCategories = async (rows) => {
    if (mode !== 'open' && mode !== 'specific') return;

    const categories = unique(rows.map((entry) => entry.payload.category_slug));
    for (const slug of categories) {
      const body = {
        category_slug: slug,
        label: slug,
      };
      if (mode === 'specific' && selectedNode?.slugKey) {
        body.parent_slug = selectedNode.slugKey;
      }
      try {
        await fetch(`${API_BASE}/api/navlinks/add-category-slug`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {}
    }
  };

  const uploadChunk = async (products) => {
    const res = await fetch(`${API_BASE}/api/products/bulk-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Chunk upload failed');
    }
    return data;
  };

  const handleZipUpload = async () => {
    if (!selectedZipFile) {
      setMessage('❌ Please choose a ZIP file');
      return;
    }

    setZipUploading(true);
    setMessage('');

    try {
      const fd = new FormData();
      fd.append('zipFile', selectedZipFile);

      const res = await fetch(`${API_BASE}/api/products/upload-zip-images`, {
        method: 'POST',
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(`❌ ${data.error || 'ZIP upload failed'}`);
        return;
      }

      setZipSummary({
        uploadedCount: Number(data.uploadedCount || 0),
        linkedProducts: Number(data.linkedProducts || 0),
        skippedCount: Number(data.skippedCount || 0),
      });

      setMessage(
        `✅ ZIP uploaded successfully. Uploaded: ${Number(data.uploadedCount || 0)}, Linked Products: ${Number(data.linkedProducts || 0)}, Skipped: ${Number(data.skippedCount || 0)}`
      );

      setSelectedZipFile(null);
      if (zipInputRef.current) zipInputRef.current.value = '';
    } catch (err) {
      setMessage(`❌ ${err.message || 'ZIP upload failed'}`);
    } finally {
      setZipUploading(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!selectedSheets.length) {
      setMessage('❌ Please select at least one sheet');
      return;
    }

    if (!mapping.name || !mapping.brand || !mapping.mrp) {
      setMessage('❌ Please map at least Name, Brand and MRP');
      return;
    }

    if (mode === 'specific' && !selectedNode?.slugKey) {
      setMessage('❌ Please choose the parent header');
      return;
    }

    if (categorySource === 'fixed' && !normalize(fixedCategorySlug)) {
      setMessage('❌ Please enter the category slug');
      return;
    }

    const rows = getImportRows();

    if (!rows.length) {
      setMessage('❌ No valid product rows found');
      return;
    }

    setImporting(true);
    setProgress({ total: rows.length, done: 0, success: 0, failed: 0 });

    try {
      await ensureCategories(rows);

      const products = rows.map((entry) => entry.payload);
      const chunks = chunkArray(products, 200);

      let done = 0;
      let success = 0;
      let failed = 0;

      for (const chunk of chunks) {
        const result = await uploadChunk(chunk);
        success += Number(result.success || 0);
        failed += Number(result.failed || 0);
        done += chunk.length;

        setProgress({
          total: products.length,
          done,
          success,
          failed,
        });
      }

      if (failed === 0) {
        setMessage(`✅ ${success} products imported successfully`);
      } else {
        setMessage(`⚠️ Imported ${success} products, ${failed} failed`);
      }
    } catch (err) {
      setMessage(`❌ ${err.message || 'Bulk import failed'}`);
    } finally {
      setImporting(false);
    }
  };

  const categoryPreview = useMemo(() => {
    const rows = getImportRows().slice(0, 8);
    return rows.map((entry) => ({
      sheetName: entry.sheetName,
      name: entry.payload.name,
      category_slug: entry.payload.category_slug,
      brand: entry.payload.brand,
      mrp: entry.payload.mrp,
      mahaveer_price: entry.payload.mahaveer_price,
      hsn_code: entry.payload.hsn_code,
    }));
  }, [sheetSummaries, selectedSheets, mapping, categorySource, fixedCategorySlug, published]);

  return (
    <div className="main-entry-final">
      <AdminNavbar />
      <div className="addProduct-root-final">
        <div className="addProduct-container-final" style={{ maxWidth: '1200px' }}>
          <h2 className="addProduct-title-final">Bulk Product Upload</h2>

          <div className="upload-cards-grid-final">
            <div className="upload-card-final">
              <div className="upload-card-head-final">
                <div>
                  <h3 className="upload-card-title-final">Excel Upload</h3>
                  <p className="upload-card-subtitle-final">Choose the workbook first, then click the upload button.</p>
                </div>
                <div className="upload-badge-final excel-final">
                  {sheetSummaries.length} Sheets
                </div>
              </div>

              <div className="upload-card-body-final">
                <label className="upload-label-final">Select Excel File</label>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileSelect}
                />
                <div className="selected-file-name-final">
                  {selectedExcelFile ? selectedExcelFile.name : 'No Excel file selected'}
                </div>
                <button
                  type="button"
                  className="upload-action-btn-final"
                  onClick={handleWorkbookUpload}
                  disabled={!selectedExcelFile || importing || zipUploading}
                >
                  Upload Excel
                </button>
              </div>

              <div className="upload-card-stats-final">
                <span><strong>Detected Sheets:</strong> {sheetSummaries.length}</span>
                <span><strong>Total Rows:</strong> {totalSelectedRows}</span>
                <span><strong>Headers:</strong> {availableHeaders.length}</span>
              </div>
            </div>

            <div className="upload-card-final">
              <div className="upload-card-head-final">
                <div>
                  <h3 className="upload-card-title-final">Images ZIP Upload</h3>
                  <p className="upload-card-subtitle-final">Choose the ZIP file first, then click the upload button.</p>
                </div>
                <div className="upload-badge-final zip-final">
                  {zipSummary.uploadedCount} Uploaded
                </div>
              </div>

              <div className="upload-card-body-final">
                <label className="upload-label-final">Select ZIP File</label>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleZipFileSelect}
                  disabled={zipUploading}
                />
                <div className="selected-file-name-final">
                  {selectedZipFile ? selectedZipFile.name : 'No ZIP file selected'}
                </div>
                <button
                  type="button"
                  className="upload-action-btn-final zip-btn-final"
                  onClick={handleZipUpload}
                  disabled={!selectedZipFile || zipUploading || importing}
                >
                  {zipUploading ? 'Uploading ZIP...' : 'Upload ZIP'}
                </button>
              </div>

              <div className="upload-card-stats-final">
                <span><strong>ZIP Uploaded:</strong> {zipSummary.uploadedCount}</span>
                <span><strong>Products Linked:</strong> {zipSummary.linkedProducts}</span>
                <span><strong>ZIP Skipped:</strong> {zipSummary.skippedCount}</span>
              </div>
            </div>
          </div>

          <div className="navlink-mode-final">
            <button
              type="button"
              className={mode === 'open' ? 'mode-btn-final active-final' : 'mode-btn-final'}
              onClick={() => {
                setMode('open');
                setSelectedNode(null);
              }}
            >
              Open Header
            </button>
            <button
              type="button"
              className={mode === 'specific' ? 'mode-btn-final active-final' : 'mode-btn-final'}
              onClick={() => setMode('specific')}
            >
              New Header Under Existing
            </button>
            <button
              type="button"
              className={!mode ? 'mode-btn-final active-final' : 'mode-btn-final'}
              onClick={() => {
                setMode('');
                setSelectedNode(null);
              }}
            >
              Existing Header
            </button>
          </div>

          {mode === 'specific' ? (
            <div className="specific-location-form-final" style={{ marginBottom: 20 }}>
              <label>Place Under</label>
              <select value={selectedNode?.slugKey || ''} onChange={(e) => setSelectedNode(findNodeBySlugKey(navTree, e.target.value))}>
                <option value="">Select location</option>
                {renderNavOptions(navTree)}
              </select>
            </div>
          ) : null}

          <form className="addProduct-form-final" onSubmit={handleImport}>
            <div className="grid-2-final">
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Category Source</label>
                <select value={categorySource} onChange={(e) => setCategorySource(e.target.value)}>
                  <option value="sheet">Use Sheet Name</option>
                  <option value="group">Use GROUP NAME Column</option>
                  <option value="fixed">Use Fixed Category Slug</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Published</label>
                <label className="published-checkbox-final" style={{ display: 'inline-flex', marginTop: 10 }}>
                  <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                  Published
                </label>
              </div>
            </div>

            {categorySource === 'fixed' ? (
              <div className="grid-1-final">
                <input
                  value={fixedCategorySlug}
                  onChange={(e) => setFixedCategorySlug(normalize(e.target.value))}
                  placeholder="Category Slug"
                />
              </div>
            ) : null}

            {sheetSummaries.length ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16, marginBottom: 20 }}>
                <h3 style={{ marginBottom: 12 }}>Sheets</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {sheetSummaries.map((sheet) => (
                    <label
                      key={sheet.sheetName}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        background: selectedSheets.includes(sheet.sheetName) ? '#f8fbff' : '#fff'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedSheets.includes(sheet.sheetName)}
                          onChange={() => toggleSheet(sheet.sheetName)}
                        />
                        <strong>{sheet.sheetName}</strong>
                      </span>
                      <span>Rows: {sheet.rowCount}</span>
                      <span>Headers: {sheet.headers.length}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {availableHeaders.length ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <h3 style={{ marginBottom: 12 }}>Header Mapping</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  {PRODUCT_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>{field.label}</label>
                      <select value={mapping[field.key] || ''} onChange={(e) => handleMappingChange(field.key, e.target.value)}>
                        <option value="">Not Mapped</option>
                        {availableHeaders.map((header) => (
                          <option key={`${field.key}-${header}`} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {previewRows.length ? (
              <div className="preview-table-wrap-final">
                <h3 style={{ marginBottom: 12 }}>Excel Preview</h3>
                <table className="preview-table-final">
                  <thead>
                    <tr>
                      <th>Sheet</th>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>MRP</th>
                      <th>Mapped Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.sheetName}</td>
                        <td>{toText(item.row[mapping.name] || item.row['ITEM NAME'])}</td>
                        <td>{toText(item.row[mapping.brand] || item.row['BRAND'])}</td>
                        <td>{toText(item.row[mapping.mrp] || item.row['MRP'])}</td>
                        <td>{toText(item.row[mapping.mahaveer_price] || item.row['SALES RATE'])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {categoryPreview.length ? (
              <div className="preview-table-wrap-final">
                <h3 style={{ marginBottom: 12 }}>Import Preview</h3>
                <table className="preview-table-final">
                  <thead>
                    <tr>
                      <th>Sheet</th>
                      <th>Category</th>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>HSN</th>
                      <th>MRP</th>
                      <th>Mahaveer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryPreview.map((item, idx) => (
                      <tr key={`${item.sheetName}-${item.name}-${idx}`}>
                        <td>{item.sheetName}</td>
                        <td>{item.category_slug}</td>
                        <td>{item.name}</td>
                        <td>{item.brand}</td>
                        <td>{item.hsn_code}</td>
                        <td>{item.mrp}</td>
                        <td>{item.mahaveer_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="price-preview-final">
              <span><strong>Total Selected Sheets:</strong> {selectedSheets.length}</span>
              <span><strong>Total Rows:</strong> {totalSelectedRows}</span>
              <span><strong>Valid Import Rows:</strong> {getImportRows().length}</span>
            </div>

            <button type="submit" className="submit-btn-final" disabled={importing || zipUploading}>
              {importing ? 'Importing...' : 'Start Bulk Upload'}
            </button>
          </form>

          {(importing || zipUploading) ? (
            <div className="bulk-progress-final">
              <div className="bulk-progress-title-final">
                {zipUploading ? 'ZIP Upload in Progress' : 'Import Progress'}
              </div>
              <div className="bulk-progress-bar-final">
                <div
                  className="bulk-progress-fill-final"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="bulk-progress-stats-final">
                <span>Total: {progress.total}</span>
                <span>Done: {progress.done}</span>
                <span>Success: {progress.success}</span>
                <span>Failed: {progress.failed}</span>
              </div>
            </div>
          ) : null}

          {message ? <p className="submit-message-final">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default AddBulkProduct;