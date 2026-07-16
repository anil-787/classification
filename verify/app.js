/**
 * IPC-CPC Code Extractor & Verifier
 * FINAL STABLE VERSION
 *
 * Data mapping:
 *   code        <- SYMBOL
 *   type        <- TYPE
 *   level       <- LEVEL
 *   definition  <- SUBJECT
 *
 * Hidden fields (never rendered):
 *   WARNING, SELF IPC, PARENT, CHILDS, SORT, NOTE
 */

/* =========================================================
   DATABASE CONFIGURATION
   ---------------------------------------------------------
   These JSON files live in ../database/
========================================================= */
const DB_FILES = ["A","B","C","D","E","F","G","H","Y"];

/* =========================================================
   GLOBAL APPLICATION STATE
   ---------------------------------------------------------
   This object is the single source of truth.
========================================================= */
const state = {
  dedupCodes: [],              // Parsed & deduplicated codes from input
  jsonIndex: new Map(),        // SYMBOL -> JSON entry (fast lookup)
  ipcSelected: new Set(),      // Selected IPC codes
  cpcSelected: new Set(),      // Selected CPC codes
  showUnmatched: true,         // Toggle matched / unmatched rows
  useMergedDefinitions: false, // Toggle individual vs parent-merged definitions
  currentSort: { col:null, dir:1 } // Table sorting state
};

/* Cached DOM elements (performance + clarity) */
const els = {};

/* =========================================================
   APPLICATION ENTRY POINT
========================================================= */
document.addEventListener("DOMContentLoaded", init);

/**
 * init()
 * ---------------------------------------------------------
 * Runs once after DOM is ready.
 * - Caches DOM elements
 * - Wires all event listeners
 * - Restores theme
 */
function init() {

  /* Cache DOM references */
  [
    "modeToggle","modeInfo","inputString",
    "formattedCard","formattedStrings",
    "resultsCard","resultsTable",
    "textAreas","selectedPanel",
    "loaderOverlay","resultsCount",
    "searchInput","typeFilter",
    "selectedIpcList","selectedCpcList",
    "definitionToggle","definitionInfo"
  ].forEach(id => els[id] = document.getElementById(id));

   /* =========================================================
   MODE TOGGLE (EXTRACT <-> CONVERT)
   ---------------------------------------------------------
   Extract Mode (OFF):
     - Parses IPC/CPC codes exactly as written in text
     - Uses regex extraction

   Convert Mode (ON):
     - Accepts compact / numeric patent classification inputs
     - Tokenizes input and normalizes into IPC/CPC format
     - Example:
         Input:  A012345678900
         Output: A01B234/5678

   NOTE:
   This listener only updates the UI label.
   Actual mode logic is applied in formatPatentString().
========================================================= */
   
   els.modeToggle.addEventListener("change", () => {
    els.modeInfo.textContent = els.modeToggle.checked
      ? "Convert Mode"
      : "Extract Mode";
  }); 

  if (els.definitionToggle) {
    els.definitionToggle.addEventListener("change", () => {
      state.useMergedDefinitions = els.definitionToggle.checked;
      els.definitionInfo.textContent = state.useMergedDefinitions
        ? "Merged Definition"
        : "Individual Definition";
      if (els.resultsCard && els.resultsCard.style.display !== "none") {
        renderTable();
      }
    });
  }

  /* Button bindings */
  document.getElementById("pasteBtn").onclick = pasteFromClipboard;
  document.getElementById("clearBtn").onclick = resetApp;
  document.getElementById("formatBtn").onclick = formatPatentString;
  document.getElementById("copySelectedBtn").onclick = copySelected;
  const copyResultsBtn = document.getElementById("copyResultsBtn");
  if (copyResultsBtn) copyResultsBtn.addEventListener("click", copyVisibleResults);
  document.getElementById("toggleMatchedBtn").onclick = toggleUnmatched;
  document.getElementById("fabCopy").onclick = copySelected;
  document.getElementById("fabClear").onclick = clearSelections;
  document.getElementById("copyIpcBtn").onclick = () => copyTypeSet("IPC");
  document.getElementById("copyCpcBtn").onclick = () => copyTypeSet("CPC");
  document.getElementById("clearIpcSelectedBtn").onclick = () => clearTypeSelections("IPC");
  document.getElementById("clearCpcSelectedBtn").onclick = () => clearTypeSelections("CPC");

  /* Save & Browse Sets */
  document.getElementById("saveSetBtn").onclick = openSaveSetModal;
  document.getElementById("browseBtn").onclick = openBrowseSetsModal;
  document.getElementById("saveSetConfirmBtn").onclick = confirmSaveSet;
  document.getElementById("saveSetCancelBtn").onclick = closeSaveSetModal;
  document.getElementById("saveSetCloseBtn").onclick = closeSaveSetModal;
  document.getElementById("browseSetsCloseBtn").onclick = closeBrowseSetsModal;
  document.getElementById("browseSetsRefreshBtn").onclick = refreshBrowseSets;
  document.getElementById("browseSetsSearch").oninput = debounce(() => refreshBrowseSets(), 180);
  document.getElementById("browseSetsExportBtn").onclick = exportAllSets;
  document.getElementById("browseSetsImportBtn").onclick = () => document.getElementById("importFileInput").click();
  document.getElementById("importFileInput").onchange = handleImportFile;
  document.getElementById("setDetailCloseBtn").onclick = closeSetDetailModal;
  document.getElementById("setDetailCancelBtn").onclick = closeSetDetailModal;
  document.getElementById("setDetailSaveBtn").onclick = confirmUpdateSet;
  document.getElementById("setDetailDeleteBtn").onclick = confirmDeleteSet;

  const groupLinks = document.getElementById("hierarchyGroupLinks");
  if (groupLinks) {
    groupLinks.onclick = (e) => {
      const btn = e.target.closest("button[data-group]");
      if (!btn) return;
      openHierarchyFor(btn.dataset.group);
    };
  }

  /* Filters */
  els.searchInput.oninput = debounce(renderTable,180);
  els.typeFilter.onchange = renderTable;

  // Prevent OS-level file-drag UI overlay when moving chips inside the app
  document.addEventListener("dragenter", e => e.preventDefault());
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("dragleave", e => e.preventDefault());
  document.addEventListener("drop", e => e.preventDefault());

  /* Sorting (event delegation on table header) */
  els.resultsTable.onclick = e => {
    const th = e.target.closest("th[data-col]");
    if (!th) return;

    const col = th.dataset.col;
    state.currentSort.dir =
      state.currentSort.col === col ? -state.currentSort.dir : 1;
    state.currentSort.col = col;

    renderTable();
  };

  /* Theme initialization (CRITICAL) */
  initTheme();
}

/* =========================================================
   THEME HANDLING
========================================================= */

/**
 * initTheme()
 * ---------------------------------------------------------
 * Restores theme from localStorage and wires selector.
 * CSS relies on <html data-theme="...">
 */
function initTheme(){
  const select = document.getElementById("themeSelect");
  const saved = localStorage.getItem("wipo-theme") || "light";

  applyTheme(saved);
  select.value = saved;

  select.onchange = e => {
    applyTheme(e.target.value);
  };
}

/**
 * applyTheme(name)
 * ---------------------------------------------------------
 * Applies theme by setting data-theme on <html>
 */
function applyTheme(name){
  const root = document.documentElement;

  if (name === "light") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", name);
  }

  localStorage.setItem("wipo-theme", name);
}

/* =========================================================
   DATABASE LOADING
========================================================= */

/**
 * loadDatabase()
 * ---------------------------------------------------------
 * Loads all JSON files and builds a SYMBOL-indexed Map.
 * This gives O(1) lookups during rendering.
 */
async function loadDatabase(){
  const files = await Promise.all(
    DB_FILES.map(f =>
      fetch(`../database/${f}.json`)
        .then(r=>r.json())
        .catch(()=>[])
    )
  );

  const flat = files.flat();

  state.jsonIndex = new Map(
    flat
      .filter(e => e.SYMBOL)
      .map(e => [e.SYMBOL.toUpperCase(), e])
  );
}

/* =========================================================
   MAIN USER ACTION
========================================================= */

/**
 * formatPatentString()
 * ---------------------------------------------------------
 * Main workflow when user clicks "Format"
 */
async function formatPatentString(){
  const input = els.inputString.value.trim();
  if (!input) return alert("Please enter text");

  showLoader();

  /* Extract or Convert */
  const codes = els.modeToggle.checked
    ? tokenize(input).map(convertCode).filter(Boolean)
    : regexExtract(input);

  /* Deduplicate */
  state.dedupCodes = [...new Set(codes.map(c=>c.toUpperCase()))];

  els.formattedStrings.value = state.dedupCodes.join(", ");
  els.formattedCard.style.display = state.dedupCodes.length ? "block" : "none";

  /* Load DB and render */
  await loadDatabase();
  clearSelections(false);
  els.resultsCard.style.display = "block";
  renderTable();

  hideLoader();
}

/* =========================================================
   TABLE RENDERING
========================================================= */

/**
 * renderTable()
 * ---------------------------------------------------------
 * Builds table rows from state, applies filters, sorting,
 * and re-syncs selection state.
 */
function renderTable(){

  /* Build row models */
  let rows = state.dedupCodes.map(code => {
    const e = state.jsonIndex.get(code);

    if (!e) {
      return {
        code,
        status: "Not Matched",
        type: "-",
        level: "-",
        definition: "-",
        verify: null,
        matched: false
      };
    }

    return {
      code: e.SYMBOL,
      status: "Matched",
      type: e.TYPE || "-",
      level: e.LEVEL ?? "-",
      definition: formatMergedDefinitionForTable(e.SYMBOL, e.SUBJECT),
      verify: `https://worldwide.espacenet.com/patent/cpc-browser#!/CPC=${e.SYMBOL}`,
      matched: true
    };
  });

  /* Toggle unmatched */
  if (!state.showUnmatched)
    rows = rows.filter(r=>r.matched);

  /* Type filter */
  if (els.typeFilter.value)
    rows = rows.filter(r=>r.type === els.typeFilter.value);

  /* Search */
  const q = els.searchInput.value.toLowerCase();
  if (q)
    rows = rows.filter(r =>
      `${r.code} ${r.definition} ${r.type}`.toLowerCase().includes(q)
    );

  /* Sorting */
  if (state.currentSort.col){
    const {col,dir} = state.currentSort;
    rows.sort((a,b)=>
      String(a[col]).localeCompare(String(b[col])) * dir
    );
  }

  els.resultsCount.textContent = `${rows.length} results`;

  /* Render HTML */
  els.resultsTable.innerHTML = `
    <thead>
      <tr>
        <th><input type="checkbox" id="selectAllCheckbox"></th>
        <th data-col="code">Code</th>
        <th data-col="status">Status</th>
        <th data-col="type">Type</th>
        <th data-col="level">Level</th>
        <th data-col="definition">Definition</th>
        <th>Verify</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r=>`
        <tr class="${r.matched ? (r.type==="IPC"?"ipc-row":"cpc-row") : "notmatched"}">
          <td>
            <input type="checkbox"
              class="rowCheck"
              data-code="${r.code}"
              data-type="${r.type}"
              ${r.matched && isChecked(r) ? "checked":""}
              ${!r.matched ? "disabled":""}>
          </td>
          <td><a class="code-link" href="javascript:void(0)" onclick="openHierarchyFor('${r.code}')">${r.code}</a></td>
          <td>${r.status}</td>
          <td>${r.type}</td>
          <td>${r.level}</td>
          <td>${r.definition}</td>
          <td>${r.verify ? `<a class="verify" href="${r.verify}" target="_blank">Verify</a>` : "-"}</td>
          <td><button class="small-btn" style="background:#dc2626;font-size:10px;padding:2px 6px" onclick="removeSelectedCode('${r.code}', '${r.type}')">Delete</button></td>
        </tr>
      `).join("")}
    </tbody>
  `;

  bindRowChecks();
  bindSelectAll();
  updateBoxes();
  els.textAreas.style.display = "flex";
}

/* =========================================================
   SELECTION HANDLING
========================================================= */

/**
 * bindRowChecks()
 * ---------------------------------------------------------
 * Keeps checkbox state in sync with Sets.
 */
function bindRowChecks(){
  document.querySelectorAll(".rowCheck").forEach(cb=>{
    cb.onchange = e=>{
      const {code,type} = e.target.dataset;
      if (e.target.checked){
        type==="IPC" ? state.ipcSelected.add(code) : state.cpcSelected.add(code);
      } else {
        type==="IPC" ? state.ipcSelected.delete(code) : state.cpcSelected.delete(code);
      }
      syncSelectAll();
      updateBoxes();
    };
  });
}

/**
 * bindSelectAll()
 * ---------------------------------------------------------
 * Selects only visible, matched rows.
 */
function bindSelectAll(){
  const all = document.getElementById("selectAllCheckbox");
  if (!all) return;

  all.onchange = e=>{
    document.querySelectorAll(".rowCheck").forEach(cb=>{
      if (cb.disabled) return;
      cb.checked = e.target.checked;
      const {code,type} = cb.dataset;
      e.target.checked
        ? (type==="IPC"?state.ipcSelected.add(code):state.cpcSelected.add(code))
        : (type==="IPC"?state.ipcSelected.delete(code):state.cpcSelected.delete(code));
    });
    updateBoxes();
  };

  syncSelectAll();
}

/**
 * syncSelectAll()
 * ---------------------------------------------------------
 * Keeps Select-All checkbox accurate.
 */
function syncSelectAll(){
  const checks = [...document.querySelectorAll(".rowCheck")].filter(c=>!c.disabled);
  const all = document.getElementById("selectAllCheckbox");
  if (!all || !checks.length) return;
  all.checked = checks.every(c=>c.checked);
}

function isChecked(r){
  return r.type==="IPC"
    ? state.ipcSelected.has(r.code)
    : state.cpcSelected.has(r.code);
}

/* =========================================================
   USER ACTIONS
========================================================= */

function copySelected(){
  const all = [...state.ipcSelected, ...state.cpcSelected].join(", ");
  if (!all) return alert("No codes selected");
  writeClipboardText(all);
}

function writeClipboardText(text){
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallbackClipboardWrite(text));
  }

  return fallbackClipboardWrite(text);
}

function fallbackClipboardWrite(text){
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    return document.execCommand("copy")
      ? Promise.resolve()
      : Promise.reject(new Error("Copy command was not accepted"));
  } catch (err) {
    return Promise.reject(err);
  } finally {
    document.body.removeChild(textArea);
  }
}

function copyVisibleResults(){
  const table = els.resultsTable || document.getElementById("resultsTable");
  if (!table) return alert("Results table is not available yet");

  const rows = [...table.querySelectorAll("tbody tr")].map(tr => {
    const cells = tr.querySelectorAll("td");
    const code = normalizeCopiedCellText(cells[1]?.textContent);
    const definition = normalizeCopiedCellText(cells[5]?.textContent);
    return code ? `${code} - ${definition || "-"}` : "";
  }).filter(Boolean);

  if (!rows.length) return alert("No visible result rows to copy");

  writeClipboardText(rows.join("\n"))
    .then(() => {
      showCopyResultsFeedback();
    })
    .catch(() => alert("Could not copy results. Please try again."));
}

window.copyVisibleResults = copyVisibleResults;

function normalizeCopiedCellText(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

function showCopyResultsFeedback(){
  const btn = document.getElementById("copyResultsBtn");
  if (!btn) return;

  const originalTitle = btn.title;
  const originalHtml = btn.innerHTML;
  btn.title = "Copied";
  btn.setAttribute("aria-label", "Copied visible results");
  btn.classList.add("copied");
  btn.textContent = "✓";

  setTimeout(() => {
    btn.title = originalTitle;
    btn.setAttribute("aria-label", "Copy visible results");
    btn.classList.remove("copied");
    btn.innerHTML = originalHtml;
  }, 1200);
}

function clearSelections(rerender=true){
  state.ipcSelected.clear();
  state.cpcSelected.clear();
  if (rerender) {
    renderTable();
  } else {
    updateBoxes();
  }
  refreshHierarchyIfOpen();
}

function toggleUnmatched(){
  state.showUnmatched = !state.showUnmatched;
  renderTable();
}

function resetApp(){
  els.inputString.value="";
  els.formattedCard.style.display="none";
  els.resultsCard.style.display="none";
  clearSelections(false);
}

/* =========================================================
   PARSING UTILITIES
========================================================= */

function tokenize(str){
  return str.split(/[\n,;\s]+/).map(s=>s.trim()).filter(Boolean);
}

function convertCode(raw){
  let t = raw.toUpperCase().replace(/[^A-Z0-9]/g,"");
  if (t.length < 12) return null;
  t = t.padEnd(14,"0");
  const p1 = t.slice(0,4);
  const p2 = t.slice(4,8).replace(/^0+/,"") || "0";
  let p3 = t.slice(8);

  // remove all trailing zeros from p3
  p3 = p3.replace(/0+$/, "");

  // apply your length rules
  if (p3.length === 0) {
  p3 = "00";
} else if (p3.length === 1) {
  p3 = p3 + "0";
}
  return `${p1}${p2}/${p3}`;
}

function regexExtract(txt){
  return txt.toUpperCase().replace(/\s+/g,"")
    .match(/[A-Z]\d{2}[A-Z]\d+\/\d+/g) || [];
}

/* =========================================================
   MISC UTILITIES
========================================================= */

function pasteFromClipboard(){
  navigator.clipboard.readText()
    .then(t=>els.inputString.value=t)
    .catch(()=>els.inputString.value=prompt("Paste text")||"");
}

function showLoader(){ els.loaderOverlay.classList.add("visible"); }
function hideLoader(){ els.loaderOverlay.classList.remove("visible"); }

function updateBoxes(){
  els.ipcBox.value = [...state.ipcSelected].join(", ");
  els.cpcBox.value = [...state.cpcSelected].join(", ");
}

function debounce(fn,ms){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); };
}

/**
 * getLevelMarker(level)
 * ---------------------------------------------------------
 * Returns marker for levels 8-18: 
 * No marker for levels 2,4,5,7
 * Level 8: * (1 asterisk)
 * Level 9: ** (2 asterisks)
 * Level 10: *** (3 asterisks)
 * ... and continues up to level 18: *********** (11 asterisks)
 */
function getLevelMarker(level) {
  if (level >= 8 && level <= 18) {
    return "*".repeat(level - 7);
  }
  return "";
}

/**
 * formatHierarchyDisplay(code, marker, subject)
 * ---------------------------------------------------------
 * Formats: Code [space] marker [spaces] subject
 * No marker: Code [2 spaces] subject
 * Single marker: Code [space] * [2 spaces] subject
 * Double marker: Code [space] ** [space] subject
 */
function formatHierarchyDisplay(code, marker, subject) {
  if (marker) {
    const spacing = marker.length === 1 ? "  " : " ";
    return `${code} ${marker}${spacing}${subject}`;
  }
  return `${code}  ${subject}`;
}

/**
 * handleHierarchyCheckbox(code, isIPC, checked)
 * ---------------------------------------------------------
 * Handles checkbox changes in hierarchy modal
 * Adds/removes codes from ipcSelected or cpcSelected
 * Updates the IPC/CPC text areas
 */
function handleHierarchyCheckbox(code, isIPC, checked) {
  if (checked) {
    if (isIPC) {
      state.ipcSelected.add(code);
    } else {
      state.cpcSelected.add(code);
    }
  } else {
    if (isIPC) {
      state.ipcSelected.delete(code);
    } else {
      state.cpcSelected.delete(code);
    }
  }
  updateBoxes();
}

/* =========================================================
   CODE HIERARCHY VIEWER
========================================================= */

/**
 * openHierarchyFor(code)
 * ---------------------------------------------------------
 * Opens hierarchy modal for a specific code showing:
 * - Parent chain going upward to root
 * - Current code highlighted
 * - Children going downward (clickable to navigate)
 */
function openHierarchyFor(code){
  window.location.href = `hierarchy.html#${code}`;
}

/**
 * buildHierarchyChain(code)
 * ---------------------------------------------------------
 * Builds a chain showing all parents up to root,
 * the current code, and its children
 */
function buildChildrenTree(code, depth = 0, visited = new Set()) {
  // Prevent infinite loops
  if (visited.has(code) || depth > 15) return [];
  visited.add(code);
  
  const entry = state.jsonIndex.get(code);
  if (!entry || !entry.CHILDS || entry.CHILDS === "NONE") return [];
  
  const children = [];
  const childCodes = entry.CHILDS.split(",").map(c => c.trim());
  
  childCodes.forEach(childCode => {
    const upper = childCode.toUpperCase();
    const childEntry = state.jsonIndex.get(upper);
    if (childEntry) {
      const node = {
        code: upper,
        subject: childEntry.SUBJECT,
        entry: childEntry,
        depth: depth,
        children: []
      };
      // Recursively get grandchildren
      node.children = buildChildrenTree(upper, depth + 1, visited);
      children.push(node);
    }
  });
  
  return children;
}

function buildHierarchyChain(code){
  const parents = [];
  const entry = state.jsonIndex.get(code);
  
  if (!entry) {
    return { parents: [], current: null, children: [] };
  }
  
  // Build parent chain upward
  let currentParent = getParentCode(entry);
  while (currentParent && currentParent !== "NONE") {
    const parentEntry = state.jsonIndex.get(currentParent);
    if (!parentEntry) break;
    parents.unshift({
      code: currentParent,
      subject: parentEntry.SUBJECT,
      entry: parentEntry
    });
    currentParent = getParentCode(parentEntry);
  }
  
  // Get children (including recursive tree)
  const children = buildChildrenTree(code);
  
  return {
    parents: parents,
    current: { code: code, subject: entry.SUBJECT, entry: entry },
    children: children
  };
}

/**
 * renderTreeNode(node, container, isFirstLevel)
 * ---------------------------------------------------------
 * Recursively renders a node and its children with proper indentation
 */
function renderTreeNode(node, container, isFirstLevel = true) {
  const item = document.createElement("div");
  item.className = "hierarchy-item child";
  item.style.marginLeft = `${node.depth * 20}px`;
  
  const level = node.entry.LEVEL;
  const isIPC = node.entry.TYPE === "IPC";
  
  // Apply colors only for level 7 and above
  if (level >= 7) {
    if (isIPC) item.classList.add("ipc-bg");
    else item.classList.add("cpc-bg");
  }
  
  const marker = getLevelMarker(level);
  const displayText = formatHierarchyDisplay(node.code, marker, node.subject);
  
  // Add checkbox for level 7 and above
  if (level >= 7) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "hierarchy-checkbox";
    checkbox.checked = isIPC ? state.ipcSelected.has(node.code) : state.cpcSelected.has(node.code);
    checkbox.onclick = (e) => {
      e.stopPropagation();
      handleHierarchyCheckbox(node.code, isIPC, checkbox.checked);
    };
    item.appendChild(checkbox);
  }
  
  const textSpan = document.createElement("span");
  textSpan.textContent = displayText;
  textSpan.style.cursor = "pointer";
  item.appendChild(textSpan);
  
  item.style.cursor = "pointer";
  item.onclick = () => openHierarchyFor(node.code);
  container.appendChild(item);
  
  // Recursively render children
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      renderTreeNode(child, container, false);
    });
  }
}

/**
 * renderHierarchyModal(hierarchy)
 * ---------------------------------------------------------
 * Renders the hierarchy chain in the modal
 */
function renderHierarchyModal(hierarchy){
  const container = document.getElementById("hierarchyContainer");
  container.innerHTML = "";
  
  // Parents section
  if (hierarchy.parents.length > 0) {
    const parentsDiv = document.createElement("div");
    parentsDiv.className = "hierarchy-section";
    
    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Parent Chain";
    parentsDiv.appendChild(label);
    
    hierarchy.parents.forEach(parent => {
      const item = document.createElement("div");
      item.className = "hierarchy-item";
      const level = parent.entry.LEVEL;
      const isIPC = parent.entry.TYPE === "IPC";
      
      // Apply colors only for level 7 and above
      if (level >= 7) {
        if (isIPC) item.classList.add("ipc-bg");
        else item.classList.add("cpc-bg");
      }
      
      const marker = getLevelMarker(level);
      const displayText = formatHierarchyDisplay(parent.code, marker, parent.subject);
      
      // Add checkbox for level 7 and above
      if (level >= 7) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "hierarchy-checkbox";
        checkbox.checked = isIPC ? state.ipcSelected.has(parent.code) : state.cpcSelected.has(parent.code);
        checkbox.onclick = (e) => {
          e.stopPropagation();
          handleHierarchyCheckbox(parent.code, isIPC, checkbox.checked);
        };
        item.appendChild(checkbox);
      }
      
      const textSpan = document.createElement("span");
      textSpan.textContent = displayText;
      textSpan.style.cursor = "pointer";
      item.appendChild(textSpan);
      
      item.style.cursor = "pointer";
      item.onclick = () => openHierarchyFor(parent.code);
      parentsDiv.appendChild(item);
    });
    
    container.appendChild(parentsDiv);
  }
  
  // Current code section
  if (hierarchy.current) {
    const currentDiv = document.createElement("div");
    currentDiv.className = "hierarchy-section";
    
    const item = document.createElement("div");
    item.className = "hierarchy-item current";
    const level = hierarchy.current.entry.LEVEL;
    const isIPC = hierarchy.current.entry.TYPE === "IPC";
    
    // Apply colors only for level 7 and above
    if (level >= 7) {
      if (isIPC) item.classList.add("ipc-bg");
      else item.classList.add("cpc-bg");
    }
    
    const marker = getLevelMarker(level);
    const displayText = formatHierarchyDisplay(hierarchy.current.code, marker, hierarchy.current.subject);
    
    // Add checkbox for level 7 and above
    if (level >= 7) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "hierarchy-checkbox";
      checkbox.checked = isIPC ? state.ipcSelected.has(hierarchy.current.code) : state.cpcSelected.has(hierarchy.current.code);
      checkbox.onclick = (e) => {
        e.stopPropagation();
        handleHierarchyCheckbox(hierarchy.current.code, isIPC, checkbox.checked);
      };
      item.appendChild(checkbox);
    }
    
    const textSpan = document.createElement("span");
    textSpan.textContent = displayText;
    item.appendChild(textSpan);
    
    currentDiv.appendChild(item);
    container.appendChild(currentDiv);
  }
  
  // Children section
  if (hierarchy.children.length > 0) {
    const childrenDiv = document.createElement("div");
    childrenDiv.className = "hierarchy-section";
    
    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Children";
    childrenDiv.appendChild(label);
    
    // Recursively render all children
    hierarchy.children.forEach(child => {
      renderTreeNode(child, childrenDiv, true);
    });
    
    container.appendChild(childrenDiv);
  }
}

/* =========================================================
   PATCHED OVERRIDES
   ---------------------------------------------------------
   Keep these at end of file so they override earlier
   declarations without touching large legacy blocks.
========================================================= */

function renderTable(){
  let rows = state.dedupCodes.map(code => {
    const e = state.jsonIndex.get(code);
    if (!e) {
      return {
        code,
        status: "Not Matched",
        type: "-",
        level: "-",
        definition: "-",
        verify: null,
        matched: false
      };
    }
    return {
      code: e.SYMBOL,
      status: "Matched",
      type: e.TYPE || "-",
      level: e.LEVEL ?? "-",
      definition: formatMergedDefinitionForTable(e.SYMBOL, e.SUBJECT),
      verify: `https://worldwide.espacenet.com/patent/cpc-browser#!/CPC=${e.SYMBOL}`,
      matched: true
    };
  });

  if (!state.showUnmatched) rows = rows.filter(r => r.matched);
  if (els.typeFilter.value) rows = rows.filter(r => r.type === els.typeFilter.value);

  const q = els.searchInput.value.toLowerCase();
  if (q) {
    rows = rows.filter(r => `${r.code} ${r.definition} ${r.type}`.toLowerCase().includes(q));
  }

  if (state.currentSort.col) {
    const { col, dir } = state.currentSort;
    rows.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * dir);
  }

  els.resultsCount.textContent = `${rows.length} results`;
  els.resultsTable.innerHTML = "";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const thSelect = document.createElement("th");
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.id = "selectAllCheckbox";
  thSelect.appendChild(selectAll);
  headRow.appendChild(thSelect);

  [
    { label: "Code", col: "code" },
    { label: "Status", col: "status" },
    { label: "Type", col: "type" },
    { label: "Level", col: "level" },
    { label: "Definition", col: "definition" }
  ].forEach(({ label, col }) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.dataset.col = col;
    headRow.appendChild(th);
  });

  const thVerify = document.createElement("th");
  thVerify.textContent = "Verify";
  headRow.appendChild(thVerify);
  thead.appendChild(headRow);
  els.resultsTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = r.matched ? (r.type === "IPC" ? "ipc-row" : "cpc-row") : "notmatched";

    const tdCheck = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "rowCheck";
    cb.dataset.code = r.code;
    cb.dataset.type = r.type;
    cb.checked = r.matched && isChecked(r);
    cb.disabled = !r.matched;
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    const tdCode = document.createElement("td");
    const codeLink = document.createElement("a");
    codeLink.className = "code-link";
    codeLink.href = "#";
    codeLink.textContent = r.code;
    codeLink.onclick = (e) => {
      e.preventDefault();
      openHierarchyFor(r.code);
    };
    tdCode.appendChild(codeLink);
    tr.appendChild(tdCode);

    ["status", "type", "level"].forEach(key => {
      const td = document.createElement("td");
      td.textContent = String(r[key] ?? "");
      tr.appendChild(td);
    });

    const tdDefinition = document.createElement("td");
    appendDefinitionWithCodeLinks(tdDefinition, r.definition);
    tr.appendChild(tdDefinition);

    const tdVerify = document.createElement("td");
    if (r.verify) {
      const verifyLink = document.createElement("a");
      verifyLink.className = "verify";
      verifyLink.href = r.verify;
      verifyLink.target = "_blank";
      verifyLink.rel = "noopener noreferrer";
      verifyLink.textContent = "Verify";
      tdVerify.appendChild(verifyLink);
    } else {
      tdVerify.textContent = "-";
    }
    tr.appendChild(tdVerify);
    tbody.appendChild(tr);
  });

  els.resultsTable.appendChild(tbody);
  bindRowChecks();
  bindSelectAll();
  updateBoxes();
  els.textAreas.style.display = "flex";
}

function syncVisibleRowChecks(){
  document.querySelectorAll(".rowCheck").forEach(cb => {
    if (cb.disabled) return;
    const { code, type } = cb.dataset;
    cb.checked = type === "IPC"
      ? state.ipcSelected.has(code)
      : state.cpcSelected.has(code);
  });
}

function handleHierarchyCheckbox(code, isIPC, checked) {
  if (checked) {
    if (isIPC) state.ipcSelected.add(code);
    else state.cpcSelected.add(code);
  } else {
    if (isIPC) state.ipcSelected.delete(code);
    else state.cpcSelected.delete(code);
  }
  syncVisibleRowChecks();
  syncSelectAll();
  updateBoxes();
}

const hierarchyViewState = {
  activeCode: "",
  searchQuery: "",
  immediateChildrenOnly: false,
  showFullDefinition: false
};

function getParentCode(entry) {
  return String(entry && (entry.PARENT || entry.parent) || "").trim().toUpperCase();
}

function normalizeDefinitionText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFullDefinitionChain(code) {
  const chain = [];
  const visited = new Set();
  let currentCode = String(code || "").trim().toUpperCase();

  while (currentCode && currentCode !== "NONE" && !visited.has(currentCode)) {
    const entry = state.jsonIndex.get(currentCode);
    if (!entry) break;

    chain.push({
      code: currentCode,
      type: entry.TYPE || "-",
      level: entry.LEVEL ?? "-",
      subject: normalizeDefinitionText(entry.SUBJECT),
      entry
    });

    visited.add(currentCode);
    currentCode = getParentCode(entry);
  }

  return chain.reverse();
}

function isBroadClassificationType(type) {
  return ["SECTION", "CLASS", "SUBCLASS"].includes(String(type || "").toUpperCase());
}

function getMergedDefinitionNodes(code) {
  const chain = buildFullDefinitionChain(code);
  if (!chain.length) return [];

  const selected = chain[chain.length - 1];
  if (isBroadClassificationType(selected.type)) {
    return [selected];
  }

  return chain.filter(node => !isBroadClassificationType(node.type));
}

function formatFullDefinition(code) {
  const chain = buildFullDefinitionChain(code);
  if (!chain.length) return `No definition found for ${code}.`;

  const selected = chain[chain.length - 1];
  const meaningPath = chain
    .map(node => node.subject)
    .filter(Boolean)
    .join(" > ");

  return [
    `Complete meaning for ${selected.code}`,
    "",
    "Hierarchy path:",
    ...chain.map((node, index) => {
      const prefix = `${index + 1}. ${node.code} (${node.type}, level ${node.level})`;
      return `${prefix}: ${node.subject || "-"}`;
    }),
    "",
    "Merged definition:",
    meaningPath || "-"
  ].join("\n");
}

function formatMergedDefinitionForTable(code, fallbackSubject) {
  if (!state.useMergedDefinitions) {
    return fallbackSubject || "-";
  }

  const chain = buildFullDefinitionChain(code);
  const mergedDefinition = getMergedDefinitionNodes(code)
    .map(node => node.subject)
    .filter(Boolean)
    .join(" > ");

  return mergedDefinition || fallbackSubject || "-";
}

function appendDefinitionWithCodeLinks(container, definition) {
  const text = String(definition || "");
  const codePattern = /\b[A-HY]\d{2}[A-Z]\d+[A-Z]?\/\d+[A-Z]?\b|\b[A-HY]\d{2}[A-Z]\b|\b[A-HY]\d{2}\b|\b[A-HY]\b/g;
  let lastIndex = 0;
  let match;

  while ((match = codePattern.exec(text)) !== null) {
    const rawCode = match[0];
    const code = rawCode.toUpperCase();

    if (!state.jsonIndex.has(code)) continue;

    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const link = document.createElement("a");
    link.href = "#";
    link.className = "definition-code-link";
    link.textContent = rawCode;
    link.title = `Open hierarchy for ${code}`;
    link.onclick = (e) => {
      e.preventDefault();
      openHierarchyFor(code);
    };
    container.appendChild(link);

    lastIndex = match.index + rawCode.length;
  }

  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderFullDefinitionPanel(container, code) {
  const panel = document.createElement("div");
  panel.className = "hierarchy-definition-panel";

  const title = document.createElement("div");
  title.className = "hierarchy-definition-title";
  title.textContent = `${code} - Full Definition`;
  panel.appendChild(title);

  const body = document.createElement("div");
  body.className = "hierarchy-definition-body";
  body.textContent = formatFullDefinition(code);
  panel.appendChild(body);

  container.appendChild(panel);
}

function buildImmediateChildren(code){
  const entry = state.jsonIndex.get(code);
  if (!entry || !entry.CHILDS || entry.CHILDS === "NONE") return [];

  return entry.CHILDS
    .split(",")
    .map(c => c.trim().toUpperCase())
    .map(childCode => {
      const childEntry = state.jsonIndex.get(childCode);
      if (!childEntry) return null;
      return {
        code: childCode,
        subject: childEntry.SUBJECT,
        entry: childEntry,
        depth: 0,
        children: []
      };
    })
    .filter(Boolean);
}

function buildHierarchyChain(code){
  const parents = [];
  const entry = state.jsonIndex.get(code);

  if (!entry) return { parents: [], current: null, children: [] };

  let currentParent = entry.PARENT;
  while (currentParent && currentParent !== "NONE") {
    const parentEntry = state.jsonIndex.get(currentParent);
    if (!parentEntry) break;
    parents.unshift({
      code: currentParent,
      subject: parentEntry.SUBJECT,
      entry: parentEntry
    });
    currentParent = parentEntry.PARENT;
  }

  const children = hierarchyViewState.immediateChildrenOnly
    ? buildImmediateChildren(code)
    : buildChildrenTree(code);

  return {
    parents,
    current: { code, subject: entry.SUBJECT, entry },
    children
  };
}

function isHierarchyMatch(code, subject, query){
  if (!query) return true;
  const hay = `${code} ${subject || ""}`.toLowerCase();
  return hay.includes(query);
}

function filterChildrenTree(nodes, query){
  if (!query) return nodes;

  return nodes.reduce((acc, node) => {
    const filteredChildren = filterChildrenTree(node.children || [], query);
    const selfMatch = isHierarchyMatch(node.code, node.subject, query);
    if (selfMatch || filteredChildren.length) {
      acc.push({
        ...node,
        children: filteredChildren
      });
    }
    return acc;
  }, []);
}

function renderHierarchySections(host, hierarchy, query){
  host.innerHTML = "";

  const filteredParents = hierarchy.parents.filter(p =>
    isHierarchyMatch(p.code, p.subject, query)
  );
  const currentMatches = hierarchy.current &&
    isHierarchyMatch(hierarchy.current.code, hierarchy.current.subject, query);
  const filteredChildren = filterChildrenTree(hierarchy.children, query);

  let renderedAny = false;

  if (filteredParents.length > 0) {
    renderedAny = true;
    const parentsDiv = document.createElement("div");
    parentsDiv.className = "hierarchy-section";

    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Parent Chain";
    parentsDiv.appendChild(label);

    filteredParents.forEach(parent => {
      const item = document.createElement("div");
      item.className = "hierarchy-item";
      const level = parent.entry.LEVEL;
      const isIPC = parent.entry.TYPE === "IPC";

      if (level >= 7) {
        if (isIPC) item.classList.add("ipc-bg");
        else item.classList.add("cpc-bg");
      }

      const marker = getLevelMarker(level);
      const displayText = formatHierarchyDisplay(parent.code, marker, parent.subject);

      if (level >= 7) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "hierarchy-checkbox";
        checkbox.checked = isIPC ? state.ipcSelected.has(parent.code) : state.cpcSelected.has(parent.code);
        checkbox.onclick = (e) => {
          e.stopPropagation();
          handleHierarchyCheckbox(parent.code, isIPC, checkbox.checked);
        };
        item.appendChild(checkbox);
      }

      const textSpan = document.createElement("span");
      textSpan.textContent = displayText;
      textSpan.style.cursor = "pointer";
      item.appendChild(textSpan);

      item.style.cursor = "pointer";
      item.onclick = () => openHierarchyFor(parent.code);
      parentsDiv.appendChild(item);
    });

    host.appendChild(parentsDiv);
  }

  if (hierarchy.current && currentMatches) {
    renderedAny = true;
    const currentDiv = document.createElement("div");
    currentDiv.className = "hierarchy-section";

    const item = document.createElement("div");
    item.className = "hierarchy-item current";
    const level = hierarchy.current.entry.LEVEL;
    const isIPC = hierarchy.current.entry.TYPE === "IPC";

    if (level >= 7) {
      if (isIPC) item.classList.add("ipc-bg");
      else item.classList.add("cpc-bg");
    }

    const marker = getLevelMarker(level);
    const displayText = formatHierarchyDisplay(
      hierarchy.current.code,
      marker,
      hierarchy.current.subject
    );

    if (level >= 7) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "hierarchy-checkbox";
      checkbox.checked = isIPC
        ? state.ipcSelected.has(hierarchy.current.code)
        : state.cpcSelected.has(hierarchy.current.code);
      checkbox.onclick = (e) => {
        e.stopPropagation();
        handleHierarchyCheckbox(hierarchy.current.code, isIPC, checkbox.checked);
      };
      item.appendChild(checkbox);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = displayText;
    item.appendChild(textSpan);

    currentDiv.appendChild(item);
    host.appendChild(currentDiv);
  }

  if (filteredChildren.length > 0) {
    renderedAny = true;
    const childrenDiv = document.createElement("div");
    childrenDiv.className = "hierarchy-section";

    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Children";
    childrenDiv.appendChild(label);

    filteredChildren.forEach(child => renderTreeNode(child, childrenDiv, true));
    host.appendChild(childrenDiv);
  }

  if (!renderedAny) {
    const empty = document.createElement("div");
    empty.className = "hierarchy-empty";
    empty.textContent = "No matching classification codes found.";
    host.appendChild(empty);
  }
}

function renderHierarchyModal(){
  const container = document.getElementById("hierarchyContainer");
  if (!container || !hierarchyViewState.activeCode) return;
  updateHierarchyGroupLinks();

  container.innerHTML = "";

  const resultsHost = document.createElement("div");
  resultsHost.id = "hierarchyResults";

  const controls = document.createElement("div");
  controls.className = "hierarchy-controls";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "hierarchy-search-input";
  search.placeholder = "Search code or subject in loaded data";
  search.value = hierarchyViewState.searchQuery;
  search.oninput = () => {
    hierarchyViewState.searchQuery = search.value;
    const hierarchy = buildHierarchyChain(hierarchyViewState.activeCode);
    const q = hierarchyViewState.searchQuery.trim().toLowerCase();
    renderHierarchySections(resultsHost, hierarchy, q);
  };

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = `hierarchy-toggle-btn${hierarchyViewState.immediateChildrenOnly ? " active" : ""}`;
  toggleBtn.textContent = hierarchyViewState.immediateChildrenOnly
    ? "Immediate Children: ON"
    : "Immediate Children: OFF";
  toggleBtn.title = hierarchyViewState.immediateChildrenOnly
    ? "Only direct children are shown"
    : "All descendants are shown";
  toggleBtn.onclick = () => {
    hierarchyViewState.immediateChildrenOnly = !hierarchyViewState.immediateChildrenOnly;
    renderHierarchyModal();
  };

  const fullDefinitionBtn = document.createElement("button");
  fullDefinitionBtn.type = "button";
  fullDefinitionBtn.className = `hierarchy-toggle-btn${hierarchyViewState.showFullDefinition ? " active" : ""}`;
  fullDefinitionBtn.textContent = "Full Definition";
  fullDefinitionBtn.title = "Build the complete definition from parent symbols";
  fullDefinitionBtn.onclick = () => {
    hierarchyViewState.showFullDefinition = !hierarchyViewState.showFullDefinition;
    renderHierarchyModal();
  };

  controls.appendChild(search);
  controls.appendChild(toggleBtn);
  controls.appendChild(fullDefinitionBtn);
  container.appendChild(controls);

  if (hierarchyViewState.showFullDefinition) {
    renderFullDefinitionPanel(container, hierarchyViewState.activeCode);
  }

  container.appendChild(resultsHost);

  const hierarchy = buildHierarchyChain(hierarchyViewState.activeCode);
  const q = hierarchyViewState.searchQuery.trim().toLowerCase();
  renderHierarchySections(resultsHost, hierarchy, q);
}

function openHierarchyFor(code){
  hierarchyViewState.activeCode = code.toUpperCase();
  renderHierarchyModal();

  const modal = document.getElementById("hierarchyModal");
  const closeBtn = document.getElementById("hierarchyCloseBtn");
  const closeModal = () => {
    modal.classList.remove("visible");
    hierarchyViewState.searchQuery = "";
  };

  modal.classList.add("visible");
  closeBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

function updateHierarchyGroupLinks(){
  const activeGroup = (hierarchyViewState.activeCode || "").charAt(0).toUpperCase();
  document.querySelectorAll("#hierarchyGroupLinks .hierarchy-group-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.group === activeGroup);
  });
}

function refreshHierarchyIfOpen(){
  const modal = document.getElementById("hierarchyModal");
  if (modal && modal.classList.contains("visible") && hierarchyViewState.activeCode) {
    renderHierarchyModal();
  }
}

function removeSelectedCode(code, type){
  if (type === "IPC") state.ipcSelected.delete(code);
  else state.cpcSelected.delete(code);

  syncVisibleRowChecks();
  syncSelectAll();
  updateBoxes();
  refreshHierarchyIfOpen();
}

function clearTypeSelections(type){
  if (type === "IPC") state.ipcSelected.clear();
  else state.cpcSelected.clear();

  syncVisibleRowChecks();
  syncSelectAll();
  updateBoxes();
  refreshHierarchyIfOpen();
}

function renderSelectedChipList(container, codes, type){
  if (!container) return;
  container.innerHTML = "";

  if (!codes.length) {
    const empty = document.createElement("span");
    empty.className = "selected-empty";
    empty.textContent = "No codes selected";
    container.appendChild(empty);
    return;
  }

  // Allow dropping into empty areas to move code to end
  container.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    container.classList.add("drag-over");
  };

  container.ondragleave = () => {
    container.classList.remove("drag-over");
  };

  container.ondrop = (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");

    const draggedCode = e.dataTransfer.getData("application/x-classification-code") || e.dataTransfer.getData("code");
    const draggedType = e.dataTransfer.getData("application/x-classification-type") || e.dataTransfer.getData("type");

    if (draggedType !== type || !draggedCode) return;

    const codesArray = [...(type === "IPC" ? state.ipcSelected : state.cpcSelected)];
    if (codesArray.length < 2 || !codesArray.includes(draggedCode)) return;

    const lastCode = codesArray[codesArray.length - 1];
    if (draggedCode === lastCode) return; // already at end

    reorderCodes(draggedCode, lastCode, type);
  };

  codes.forEach((code, index) => {
    const chip = document.createElement("div");
    chip.className = "selected-chip";
    chip.draggable = true;
    chip.dataset.code = code;
    chip.dataset.type = type;
    chip.dataset.index = index;

    const codeBtn = document.createElement("button");
    codeBtn.type = "button";
    codeBtn.className = "selected-chip-code";
    codeBtn.textContent = code;
    codeBtn.title = "Open hierarchy";
    codeBtn.onclick = () => openHierarchyFor(code);

    const dragHandle = document.createElement("span");
    dragHandle.textContent = "⋮⋮";
    dragHandle.style.cursor = "grab";
    dragHandle.style.color = "var(--muted)";
    dragHandle.style.fontSize = "12px";
    dragHandle.style.marginRight = "4px";
    dragHandle.title = "Drag to reorder";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "selected-chip-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove ${code}`;
    removeBtn.onclick = () => removeSelectedCode(code, type);

    chip.appendChild(dragHandle);
    chip.appendChild(codeBtn);
    chip.appendChild(removeBtn);

    /* Drag event handlers */
    chip.ondragstart = (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-classification-type", type);
      e.dataTransfer.setData("application/x-classification-code", code);
      e.dataTransfer.setData("text/plain", code);
      chip.classList.add("dragging");
    };

    chip.ondragend = () => {
      chip.classList.remove("dragging");
      document.querySelectorAll(".selected-chip").forEach(c => c.classList.remove("drag-over"));
    };

    chip.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const rect = chip.getBoundingClientRect();
      const dropBefore = e.clientX < rect.left + rect.width / 2;

      chip.dataset.dropPosition = dropBefore ? "before" : "after";
      chip.classList.add("drag-over");
      chip.classList.toggle("drag-over-before", dropBefore);
      chip.classList.toggle("drag-over-after", !dropBefore);
    };

    chip.ondragleave = () => {
      chip.classList.remove("drag-over", "drag-over-before", "drag-over-after");
    };

    chip.ondrop = (e) => {
      e.preventDefault();
      chip.classList.remove("drag-over", "drag-over-before", "drag-over-after");

      const draggedCode = e.dataTransfer.getData("application/x-classification-code") || e.dataTransfer.getData("code");
      const draggedType = e.dataTransfer.getData("application/x-classification-type") || e.dataTransfer.getData("type");
      const dropPosition = chip.dataset.dropPosition || "after";

      if (draggedType === type && draggedCode !== code) {
        reorderCodes(draggedCode, code, type, dropPosition === "after");
      }
    };

    container.appendChild(chip);
  });
}

/**
 * reorderCodes(draggedCode, targetCode, type)
 * ---------------------------------------------------------
 * Reorders codes by moving draggedCode and inserting it after targetCode
 * Example: G06Q10/10, G06Q10/047, G06Q10/02
 * If you drag G06Q10/10 onto G06Q10/02, result is:
 * G06Q10/047, G06Q10/02, G06Q10/10
 */
function reorderCodes(draggedCode, targetCode, type, insertAfter = true){
  const codeSet = type === "IPC" ? state.ipcSelected : state.cpcSelected;
  const codesArray = [...codeSet];

  const draggedIndex = codesArray.indexOf(draggedCode);
  const targetIndex = codesArray.indexOf(targetCode);

  if (draggedIndex === -1 || targetIndex === -1) return;

  codesArray.splice(draggedIndex, 1);

  const newTargetIndex = codesArray.indexOf(targetCode);
  if (newTargetIndex === -1) return;

  const insertIndex = insertAfter ? newTargetIndex + 1 : newTargetIndex;
  codesArray.splice(insertIndex, 0, draggedCode);

  if (type === "IPC") {
    state.ipcSelected.clear();
    codesArray.forEach(code => state.ipcSelected.add(code));
  } else {
    state.cpcSelected.clear();
    codesArray.forEach(code => state.cpcSelected.add(code));
  }

  updateBoxes();
}

function updateBoxes(){
  const ipcCodes = [...state.ipcSelected];
  const cpcCodes = [...state.cpcSelected];

  /* Show Save Set button only when selections exist */
  const saveSetBtn = document.getElementById("saveSetBtn");
  if (saveSetBtn) {
    saveSetBtn.style.display = (ipcCodes.length > 0 || cpcCodes.length > 0) ? "inline-block" : "none";
  }

  renderSelectedChipList(els.selectedIpcList, ipcCodes, "IPC");
  renderSelectedChipList(els.selectedCpcList, cpcCodes, "CPC");
}

/**
 * copyTypeSet(type)
 * ---------------------------------------------------------
 * Copies all codes of the specified type (IPC or CPC) to clipboard
 * Each code is separated by a comma and space
 */
function copyTypeSet(type){
  const codes = type === "IPC" ? [...state.ipcSelected] : [...state.cpcSelected];
  if (codes.length === 0) return alert(`No ${type} codes selected`);
  
  const codeString = codes.join(", ");
  navigator.clipboard.writeText(codeString);
  
  const btn = type === "IPC" 
    ? document.getElementById("copyIpcBtn")
    : document.getElementById("copyCpcBtn");
  
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = "✓ Copied";
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  }
}

/* =========================================================
   CLASSIFICATION SETS MANAGEMENT
   ---------------------------------------------------------
   Save, Load, Modify, Delete classification code sets
   with titles and hashtags. Uses IndexedDB for persistence.
========================================================= */

const DB_NAME = "ClassificationDB";
const DB_VERSION = 1;
const STORE_NAME = "sets";

/**
 * initDB()
 * ---------------------------------------------------------
 * Initializes IndexedDB database
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * getAllSets()
 * ---------------------------------------------------------
 * Retrieves all saved sets from IndexedDB
 */
async function getAllSets() {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Error loading sets:", e);
    return [];
  }
}

/**
 * saveSets(sets)
 * ---------------------------------------------------------
 * Saves all sets to IndexedDB
 */
async function saveSets(sets) {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing sets
    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Add new sets
    for (const set of sets) {
      await new Promise((resolve, reject) => {
        const addRequest = store.add(set);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      });
    }

    return true;
  } catch (e) {
    console.error("Error saving sets:", e);
    return false;
  }
}

/**
 * createSet(title, hashtags, ipcCodes, cpcCodes)
 * ---------------------------------------------------------
 * Creates a new classification set with timestamp
 */
function createSet(title, hashtags, ipcCodes, cpcCodes) {
  return {
    id: "set_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    title: title.trim(),
    hashtags: hashtags
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0),
    ipc: ipcCodes,
    cpc: cpcCodes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * openSaveSetModal()
 * ---------------------------------------------------------
 * Opens the save set modal and shows preview of selected codes
 */
function openSaveSetModal() {
  const modal = document.getElementById("saveSetModal");
  if (!modal) return;

  document.getElementById("saveSetTitleInput").value = "";
  document.getElementById("saveSetHashtagsInput").value = "";
  document.getElementById("saveSetMessage").textContent = "";

  /* Show preview of selected codes */
  const ipcCodes = [...state.ipcSelected];
  const cpcCodes = [...state.cpcSelected];
  
  document.getElementById("saveSetPreviewIpc").textContent = ipcCodes.length > 0 ? ipcCodes.join(", ") : "-";
  document.getElementById("saveSetPreviewCpc").textContent = cpcCodes.length > 0 ? cpcCodes.join(", ") : "-";

  modal.classList.add("visible");
}

/**
 * closeSaveSetModal()
 * ---------------------------------------------------------
 * Closes the save set modal
 */
function closeSaveSetModal() {
  const modal = document.getElementById("saveSetModal");
  if (modal) modal.classList.remove("visible");
}

/**
 * confirmSaveSet()
 * ---------------------------------------------------------
 * Saves the current selection as a new set
 */
async function confirmSaveSet() {
  const title = document.getElementById("saveSetTitleInput").value.trim();
  const hashtags = document.getElementById("saveSetHashtagsInput").value;
  const messageDiv = document.getElementById("saveSetMessage");

  if (!title) {
    messageDiv.textContent = "⚠ Title is required";
    messageDiv.style.color = "var(--primary)";
    return;
  }

  const ipcCodes = [...state.ipcSelected];
  const cpcCodes = [...state.cpcSelected];

  if (ipcCodes.length === 0 && cpcCodes.length === 0) {
    messageDiv.textContent = "⚠ Please select at least one code";
    messageDiv.style.color = "var(--primary)";
    return;
  }

  const set = createSet(title, hashtags, ipcCodes, cpcCodes);
  const allSets = await getAllSets();
  allSets.push(set);
  const success = await saveSets(allSets);

  if (success) {
    messageDiv.textContent = "✓ Set saved successfully!";
    messageDiv.style.color = "#10b981";

    setTimeout(() => {
      closeSaveSetModal();
      messageDiv.textContent = "";
    }, 1500);
  } else {
    messageDiv.textContent = "✗ Failed to save set";
    messageDiv.style.color = "var(--primary)";
  }
}

/**
 * openBrowseSetsModal()
 * ---------------------------------------------------------
 * Opens the browse sets modal and populates the table
 */
async function openBrowseSetsModal() {
  const modal = document.getElementById("browseSetsModal");
  if (!modal) return;

  modal.classList.add("visible");
  document.getElementById("browseSetsSearch").value = "";
  await refreshBrowseSets();
}

/**
 * closeBrowseSetsModal()
 * ---------------------------------------------------------
 * Closes the browse sets modal
 */
function closeBrowseSetsModal() {
  const modal = document.getElementById("browseSetsModal");
  if (modal) modal.classList.remove("visible");
}

/**
 * refreshBrowseSets()
 * ---------------------------------------------------------
 * Refreshes the browse sets table with search filter
 */
async function refreshBrowseSets() {
  const searchTerm = document.getElementById("browseSetsSearch").value.toLowerCase();
  let sets = await getAllSets();

  /* Filter by search term */
  if (searchTerm) {
    sets = sets.filter(set =>
      set.title.toLowerCase().includes(searchTerm) ||
      set.hashtags.some(tag => tag.includes(searchTerm))
    );
  }

  const tableBody = document.getElementById("browseSetsTableBody");
  if (!tableBody) return;

  if (sets.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No sets found</td></tr>';
    return;
  }

  tableBody.innerHTML = sets.map(set => `
    <tr>
      <td style="max-width:250px">
        <div style="font-weight:600;margin-bottom:4px;word-break:break-word">${set.title}</div>
        <div style="font-size:11px">${set.hashtags.length > 0 ? set.hashtags.map(t => `<span style="display:inline-block;background:rgba(47,138,90,0.1);padding:1px 4px;border-radius:999px;margin-right:2px;margin-bottom:2px">#${t}</span>`).join("") : ""}</div>
      </td>
      <td style="font-family:monospace;font-size:11px;max-width:300px;word-break:break-all;line-height:1.3">${set.ipc.length > 0 ? set.ipc.join(", ") : "-"}</td>
      <td style="font-family:monospace;font-size:11px;max-width:300px;word-break:break-all;line-height:1.3">${set.cpc.length > 0 ? set.cpc.join(", ") : "-"}</td>
      <td style="font-size:11px;color:var(--muted);white-space:nowrap">${new Date(set.createdAt).toLocaleDateString()}</td>
      <td style="text-align:center;white-space:nowrap">
        <button class="small-btn secondary" onclick="loadSetIntoApp('${set.id}')" style="font-size:10px;padding:3px 6px;margin-right:2px">Load</button>
        <button class="small-btn ghost" onclick="openSetDetailModal('${set.id}')" style="font-size:10px;padding:3px 6px;margin-right:2px">Edit</button>
        <button class="small-btn" style="background:#dc2626;font-size:10px;padding:3px 6px" onclick="deleteSet('${set.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

/**
 * loadSetIntoApp(setId)
 * ---------------------------------------------------------
 * Loads a saved set's codes into the current app state
 */
async function loadSetIntoApp(setId) {
  const sets = await getAllSets();
  const set = sets.find(s => s.id === setId);

  if (!set) {
    alert("Set not found");
    return;
  }

  /* Ensure DB is loaded so codes can be matched */
  if (!state.jsonIndex || state.jsonIndex.size === 0) {
    await loadDatabase();
  }

  /* Clear current selections */
  state.ipcSelected.clear();
  state.cpcSelected.clear();

  /* Normalize loaded codes and add to selections */
  const normalizedIpc = set.ipc
    .map(c => String(c || "").trim().toUpperCase())
    .filter(c => c);
  const normalizedCpc = set.cpc
    .map(c => String(c || "").trim().toUpperCase())
    .filter(c => c);

  normalizedIpc.forEach(code => state.ipcSelected.add(code));
  normalizedCpc.forEach(code => state.cpcSelected.add(code));

  /* If we have codes, show the results card and render table */
  if (normalizedIpc.length > 0 || normalizedCpc.length > 0) {
    state.dedupCodes = [...new Set([...normalizedIpc, ...normalizedCpc])];

    document.getElementById("resultsCard").style.display = "block";
    renderTable();
  }

  /* Update the UI boxes */
  updateBoxes();
  closeBrowseSetsModal();

  /* Show success message */
  const saveBtn = document.getElementById("saveSetBtn");
  if (saveBtn) saveBtn.textContent = "✓ Set Loaded";
  setTimeout(() => {
    if (saveBtn) saveBtn.textContent = "Save Set";
  }, 2000);
}

/**
 * openSetDetailModal(setId)
 * ---------------------------------------------------------
 * Opens the set detail modal for editing
 */
async function openSetDetailModal(setId) {
  const sets = await getAllSets();
  const set = sets.find(s => s.id === setId);

  if (!set) {
    alert("Set not found");
    return;
  }

  /* Store current set ID for update/delete operations */
  window.currentEditingSetId = setId;

  document.getElementById("setDetailTitleInput").value = set.title;
  document.getElementById("setDetailHashtagsInput").value = set.hashtags.join(", ");
  document.getElementById("setDetailIpcInput").value = set.ipc.join(", ");
  document.getElementById("setDetailCpcInput").value = set.cpc.join(", ");
  document.getElementById("setDetailMessage").textContent = "";

  const modal = document.getElementById("setDetailModal");
  if (modal) modal.classList.add("visible");
}

/**
 * closeSetDetailModal()
 * ---------------------------------------------------------
 * Closes the set detail modal
 */
function closeSetDetailModal() {
  const modal = document.getElementById("setDetailModal");
  if (modal) modal.classList.remove("visible");
  window.currentEditingSetId = null;
}

/**
 * confirmUpdateSet()
 * ---------------------------------------------------------
 * Updates the current set with new values
 */
async function confirmUpdateSet() {
  if (!window.currentEditingSetId) return;

  const sets = await getAllSets();
  const setIndex = sets.findIndex(s => s.id === window.currentEditingSetId);

  if (setIndex === -1) {
    alert("Set not found");
    return;
  }

  const title = document.getElementById("setDetailTitleInput").value.trim();
  const hashtags = document.getElementById("setDetailHashtagsInput").value;
  const ipcString = document.getElementById("setDetailIpcInput").value;
  const cpcString = document.getElementById("setDetailCpcInput").value;
  const messageDiv = document.getElementById("setDetailMessage");

  if (!title) {
    messageDiv.textContent = "⚠ Title is required";
    messageDiv.style.color = "var(--primary)";
    return;
  }

  const ipcCodes = ipcString
    .split(",")
    .map(c => c.trim())
    .filter(c => c.length > 0);
  const cpcCodes = cpcString
    .split(",")
    .map(c => c.trim())
    .filter(c => c.length > 0);

  if (ipcCodes.length === 0 && cpcCodes.length === 0) {
    messageDiv.textContent = "⚠ Please add at least one code";
    messageDiv.style.color = "var(--primary)";
    return;
  }

  const set = sets[setIndex];
  set.title = title;
  set.hashtags = hashtags
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);
  set.ipc = ipcCodes;
  set.cpc = cpcCodes;
  set.updatedAt = new Date().toISOString();

  const success = await saveSets(sets);

  if (success) {
    messageDiv.textContent = "✓ Set updated successfully!";
    messageDiv.style.color = "#10b981";

    setTimeout(() => {
      closeSetDetailModal();
      refreshBrowseSets();
    }, 1500);
  } else {
    messageDiv.textContent = "✗ Failed to update set";
    messageDiv.style.color = "var(--primary)";
  }
}

/**
 * confirmDeleteSet()
 * ---------------------------------------------------------
 * Deletes the current set after confirmation
 */
async function confirmDeleteSet() {
  if (!window.currentEditingSetId) return;

  if (!confirm("Are you sure you want to delete this set? This action cannot be undone.")) {
    return;
  }

  const sets = await getAllSets();
  const filtered = sets.filter(s => s.id !== window.currentEditingSetId);
  const success = await saveSets(filtered);

  if (success) {
    closeSetDetailModal();
    refreshBrowseSets();
  } else {
    alert("Failed to delete set");
  }
}

/**
 * deleteSet(setId)
 * ---------------------------------------------------------
 * Deletes a set directly from the browse table
 */
async function deleteSet(setId) {
  if (!confirm("Are you sure you want to delete this set? This action cannot be undone.")) {
    return;
  }

  const sets = await getAllSets();
  const filtered = sets.filter(s => s.id !== setId);
  const success = await saveSets(filtered);

  if (success) {
    refreshBrowseSets();
  } else {
    alert("Failed to delete set");
  }
}

/**
 * exportAllSets()
 * ---------------------------------------------------------
 * Exports all saved sets as a JSON file (data.json)
 */
async function exportAllSets() {
  const sets = await getAllSets();

  if (sets.length === 0) {
    alert("No sets to export");
    return;
  }

  const dataStr = JSON.stringify(sets, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * handleImportFile()
 * ---------------------------------------------------------
 * Handles file import for sets (JSON format)
 */
async function handleImportFile() {
  const fileInput = document.getElementById("importFileInput");
  const file = fileInput.files[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);

      if (!Array.isArray(imported)) {
        alert("Invalid file format. Expected an array of sets.");
        return;
      }

      const allSets = await getAllSets();

      /* Check for duplicates by ID and ask for merge strategy */
      const newSets = imported.filter(set => {
        const exists = allSets.some(s => s.id === set.id);
        if (exists) {
          console.warn("Set with ID", set.id, "already exists. Skipping.");
        }
        return !exists;
      });

      if (newSets.length === 0) {
        alert("All sets in the file already exist in your library.");
        fileInput.value = "";
        return;
      }

      allSets.push(...newSets);
      const success = await saveSets(allSets);

      if (success) {
        alert(`Successfully imported ${newSets.length} set(s)!`);
        refreshBrowseSets();
        fileInput.value = "";
      } else {
        alert("Failed to import sets");
        fileInput.value = "";
      }
    } catch (error) {
      console.error("Error importing file:", error);
      alert("Error reading file. Please ensure it's a valid JSON file.");
      fileInput.value = "";
    }
  };

  reader.readAsText(file);
}
