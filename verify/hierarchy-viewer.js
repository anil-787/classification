const DB_FILES = ["A", "B", "C", "D", "E", "F", "G", "H", "Y"];

const state = {
  jsonIndex: new Map(),
  ipcSelected: new Set(),
  cpcSelected: new Set(),
  selectionOrder: [],
  metaView: "",
  activeCode: "",
  searchQuery: "",
  immediateChildrenOnly: false
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [
    "themeSelect",
    "groupLinks",
    "codeInput",
    "openCodeBtn",
    "hierarchySearch",
    "toggleChildrenBtn",
    "showFullDefinitionBtn",
    "showNoteBtn",
    "showWarningBtn",
    "hierarchyContainer",
    "codeMetaPanel",
    "codeMetaTitle",
    "codeMetaBody",
    "statusText",
    "selectedCodeList"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  bindEvents();
  initTheme();
  updateBoxes();

  await loadDatabase();

  const fromHash = normalizeCode((window.location.hash || "").replace(/^#/, ""));
  const initial = state.jsonIndex.has(fromHash) ? fromHash : "A";
  openHierarchyFor(initial, { resetSearch: false });
}

function bindEvents() {
  els.groupLinks.onclick = (e) => {
    const btn = e.target.closest("button[data-group]");
    if (!btn) return;
    openHierarchyFor(btn.dataset.group);
  };

  els.openCodeBtn.onclick = openFromInput;
  els.codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      openFromInput();
    }
  });

  els.hierarchySearch.oninput = () => {
    state.searchQuery = els.hierarchySearch.value;
    renderHierarchy();
  };

  els.toggleChildrenBtn.onclick = () => {
    state.immediateChildrenOnly = !state.immediateChildrenOnly;
    renderHierarchy();
  };

  els.showFullDefinitionBtn.onclick = () => toggleMetaView("FULL_DEFINITION");
  els.showNoteBtn.onclick = () => toggleMetaView("NOTE");
  els.showWarningBtn.onclick = () => toggleMetaView("WARNING");
}

function initTheme() {
  const saved = localStorage.getItem("wipo-theme") || "light";
  applyTheme(saved);
  els.themeSelect.value = saved;
  els.themeSelect.onchange = (e) => applyTheme(e.target.value);
}

function applyTheme(name) {
  const root = document.documentElement;
  if (name === "light") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", name);
  localStorage.setItem("wipo-theme", name);
}

async function loadDatabase() {
  setStatus("Loading classification data...");

  const files = await Promise.all(
    DB_FILES.map((f) =>
      fetch(`../database/${f}.json`)
        .then((r) => r.json())
        .catch(() => [])
    )
  );

  const flat = files.flat();
  state.jsonIndex = new Map(
    flat
      .filter((entry) => entry.SYMBOL)
      .map((entry) => [entry.SYMBOL.toUpperCase(), entry])
  );

  if (!state.jsonIndex.size) {
    setStatus("No classification data loaded.", true);
    return;
  }

  setStatus(`Loaded ${state.jsonIndex.size} classification codes.`);
}

function findNearestCode(rawInput) {
  const normalizedInput = normalizeCode(rawInput);
  if (!normalizedInput) return null;

  if (state.jsonIndex.has(normalizedInput)) return normalizedInput;

  const normalizedPrefix = normalizedInput.replace(/[^A-Z0-9]/g, "");
  let candidate = null;

  for (const key of state.jsonIndex.keys()) {
    const keyNormalized = key.replace(/[^A-Z0-9]/g, "");
    if (keyNormalized.startsWith(normalizedPrefix)) {
      if (
        !candidate ||
        key.length < candidate.length ||
        (key.length === candidate.length && key < candidate)
      ) {
        candidate = key;
      }
    }
  }

  if (candidate) return candidate;

  if (normalizedPrefix.length >= 1) {
    const shortPrefix = normalizedPrefix.slice(0, 4);
    for (const key of state.jsonIndex.keys()) {
      const keyNormalized = key.replace(/[^A-Z0-9]/g, "");
      if (keyNormalized.startsWith(shortPrefix)) {
        return key;
      }
    }
  }

  return null;
}

function openFromInput() {
  const rawInput = els.codeInput.value;
  const nearest = findNearestCode(rawInput);

  if (!nearest) {
    setStatus(`Code "${rawInput}" was not found.`, true);
    return;
  }

  setStatus(`Opening nearest match: ${nearest}`);
  openHierarchyFor(nearest);
}

function openHierarchyFor(code, options = {}) {
  const normalized = normalizeCode(code);
  if (!normalized) return;

  if (!state.jsonIndex.has(normalized)) {
    setStatus(`Code "${normalized}" was not found in loaded data.`, true);
    return;
  }

  state.activeCode = normalized;
  els.codeInput.value = normalized;

  if (options.resetSearch !== false) {
    state.searchQuery = "";
    els.hierarchySearch.value = "";
  }

  window.location.hash = encodeURIComponent(normalized);
  renderHierarchy();
  setStatus(`Showing hierarchy for ${normalized}.`);
}

function renderHierarchy() {
  updateGroupLinks();
  updateChildrenToggle();
  updateMetaButtons();

  els.hierarchyContainer.innerHTML = "";
  if (!state.activeCode) {
    const empty = document.createElement("div");
    empty.className = "hierarchy-empty";
    empty.textContent = "Select a group or enter a code to browse hierarchy.";
    els.hierarchyContainer.appendChild(empty);
    hideMetaPanel();
    return;
  }

  const hierarchy = buildHierarchyChain(state.activeCode);
  const query = state.searchQuery.trim().toLowerCase();
  renderHierarchySections(els.hierarchyContainer, hierarchy, query);
  renderActiveMetaPanel();
}

function updateChildrenToggle() {
  els.toggleChildrenBtn.classList.toggle("active", state.immediateChildrenOnly);
  els.toggleChildrenBtn.textContent = state.immediateChildrenOnly
    ? "Immediate Children: ON"
    : "Immediate Children: OFF";
}

function updateGroupLinks() {
  const activeGroup = state.activeCode.charAt(0).toUpperCase();
  document.querySelectorAll("#groupLinks .group-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.group === activeGroup);
  });
}

function buildChildrenTree(code, depth = 0, visited = new Set()) {
  if (visited.has(code) || depth > 15) return [];

  const entry = state.jsonIndex.get(code);
  if (!entry || !entry.CHILDS || entry.CHILDS === "NONE") return [];

  const nextVisited = new Set(visited);
  nextVisited.add(code);

  return entry.CHILDS
    .split(",")
    .map((childCode) => childCode.trim().toUpperCase())
    .map((childCode) => {
      const childEntry = state.jsonIndex.get(childCode);
      if (!childEntry) return null;
      return {
        code: childCode,
        subject: childEntry.SUBJECT,
        entry: childEntry,
        depth,
        children: buildChildrenTree(childCode, depth + 1, nextVisited)
      };
    })
    .filter(Boolean);
}

function buildImmediateChildren(code) {
  const entry = state.jsonIndex.get(code);
  if (!entry || !entry.CHILDS || entry.CHILDS === "NONE") return [];

  return entry.CHILDS
    .split(",")
    .map((childCode) => childCode.trim().toUpperCase())
    .map((childCode) => {
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

function buildHierarchyChain(code) {
  const entry = state.jsonIndex.get(code);
  if (!entry) return { parents: [], current: null, children: [] };

  const parents = [];
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

  return {
    parents,
    current: { code, subject: entry.SUBJECT, entry },
    children: state.immediateChildrenOnly
      ? buildImmediateChildren(code)
      : buildChildrenTree(code)
  };
}

function getParentCode(entry) {
  return normalizeCode(entry && (entry.PARENT || entry.parent));
}

function buildFullDefinitionChain(code) {
  const normalized = normalizeCode(code);
  const chain = [];
  const visited = new Set();
  let currentCode = normalized;

  while (currentCode && currentCode !== "NONE" && !visited.has(currentCode)) {
    const entry = state.jsonIndex.get(currentCode);
    if (!entry) break;

    chain.push({
      code: currentCode,
      type: entry.TYPE || "-",
      level: entry.LEVEL ?? "-",
      subject: normalizeSubjectText(entry.SUBJECT),
      entry
    });

    visited.add(currentCode);
    currentCode = getParentCode(entry);
  }

  return chain.reverse();
}

function formatFullDefinition(code) {
  const chain = buildFullDefinitionChain(code);
  if (!chain.length) return `No definition found for ${code}.`;

  const selected = chain[chain.length - 1];
  const meaningPath = chain
    .map((node) => node.subject)
    .filter(Boolean)
    .join(" > ");

  const lines = [
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
  ];

  return lines.join("\n");
}

function renderHierarchySections(host, hierarchy, query) {
  host.innerHTML = "";

  const filteredParents = hierarchy.parents.filter((parent) =>
    isHierarchyMatch(parent.code, parent.subject, query)
  );

  const currentMatches =
    hierarchy.current &&
    isHierarchyMatch(hierarchy.current.code, hierarchy.current.subject, query);

  const filteredChildren = filterChildrenTree(hierarchy.children, query);

  let renderedAny = false;

  if (filteredParents.length) {
    renderedAny = true;
    const section = document.createElement("div");
    section.className = "hierarchy-section";

    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Parent Chain";
    section.appendChild(label);

    filteredParents.forEach((parent) => {
      section.appendChild(createHierarchyItem(parent, "parent"));
    });

    host.appendChild(section);
  }

  if (currentMatches) {
    renderedAny = true;
    const section = document.createElement("div");
    section.className = "hierarchy-section";
    section.appendChild(createHierarchyItem(hierarchy.current, "current"));
    host.appendChild(section);
  }

  if (filteredChildren.length) {
    renderedAny = true;
    const section = document.createElement("div");
    section.className = "hierarchy-section";

    const label = document.createElement("div");
    label.className = "hierarchy-label";
    label.textContent = "Children";
    section.appendChild(label);

    filteredChildren.forEach((child) => renderTreeNode(child, section));
    host.appendChild(section);
  }

  if (!renderedAny) {
    const empty = document.createElement("div");
    empty.className = "hierarchy-empty";
    empty.textContent = "No matching classification codes found.";
    host.appendChild(empty);
  }
}

function renderTreeNode(node, container) {
  const item = createHierarchyItem(node, "child");
  item.style.marginLeft = `${node.depth * 20}px`;
  container.appendChild(item);

  if (node.children && node.children.length) {
    node.children.forEach((child) => renderTreeNode(child, container));
  }
}

function createHierarchyItem(node, variant) {
  const item = document.createElement("div");
  item.className = "hierarchy-item";

  if (variant === "current") item.classList.add("current");
  if (variant === "child") item.classList.add("child");

  const level = Number(node.entry.LEVEL || 0);
  const type = String(node.entry.TYPE || "").toUpperCase();
  const isIPC = type === "IPC";
  const isCPC = type === "CPC";

  if (level >= 7) {
    if (isIPC) item.classList.add("ipc-bg");
    if (isCPC) item.classList.add("cpc-bg");
  }

  const marker = getLevelMarker(level);

  if (level >= 7 && (isIPC || isCPC)) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "hierarchy-checkbox";
    checkbox.checked = isIPC
      ? state.ipcSelected.has(node.code)
      : state.cpcSelected.has(node.code);

    checkbox.onclick = (e) => {
      e.stopPropagation();
      handleHierarchyCheckbox(node.code, isIPC, checkbox.checked);
    };

    item.appendChild(checkbox);
  }

  appendHierarchyText(item, node.code, marker, node.subject);

  item.onclick = () => openHierarchyFor(node.code, { resetSearch: false });
  return item;
}

function handleHierarchyCheckbox(code, isIPC, checked) {
  if (checked) {
    if (isIPC) {
      state.ipcSelected.add(code);
      state.cpcSelected.delete(code);
    } else {
      state.cpcSelected.add(code);
      state.ipcSelected.delete(code);
    }
    if (!state.selectionOrder.includes(code)) {
      state.selectionOrder.push(code);
    }
  } else {
    state.ipcSelected.delete(code);
    state.cpcSelected.delete(code);
    state.selectionOrder = state.selectionOrder.filter((selected) => selected !== code);
  }
  updateBoxes();
}

function unselectCode(code) {
  state.ipcSelected.delete(code);
  state.cpcSelected.delete(code);
  state.selectionOrder = state.selectionOrder.filter((selected) => selected !== code);
  updateBoxes();
  if (state.activeCode === code) {
    // keep the current visible hierarchy; but unselecting may still keep view
    renderHierarchy();
  } else {
    renderHierarchy();
  }
}

function updateBoxes() {
  renderSelectedChipList(els.selectedCodeList);
}

function renderSelectedChipList(container) {
  container.innerHTML = "";

  const ordered = state.selectionOrder.filter(
    (code) => state.ipcSelected.has(code) || state.cpcSelected.has(code)
  );

  if (!ordered.length) {
    const empty = document.createElement("div");
    empty.className = "selected-empty";
    empty.textContent = "No codes selected";
    container.appendChild(empty);
    return;
  }

  ordered.forEach((code) => {
    const chip = document.createElement("div");
    chip.className = "selected-chip";
    chip.classList.add(state.ipcSelected.has(code) ? "ipc-chip" : "cpc-chip");

    const link = document.createElement("a");
    link.href = "javascript:void(0)";
    link.className = "selected-chip-link";
    link.textContent = code;
    link.title = "Go to code in hierarchy";
    link.onclick = (e) => {
      e.preventDefault();
      openHierarchyFor(code, { resetSearch: false });
    };

    const removeBtn = document.createElement("button");
    removeBtn.className = "selected-chip-remove";
    removeBtn.type = "button";
    removeBtn.title = `Unselect ${code}`;
    removeBtn.textContent = "✕";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      unselectCode(code);
    };

    chip.appendChild(link);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

function getLevelMarker(level) {
  if (level >= 8 && level <= 18) return "*".repeat(level - 7);
  return "";
}

function appendHierarchyText(container, code, marker, subject) {
  const codeSpan = document.createElement("span");
  codeSpan.className = "hierarchy-code";
  codeSpan.textContent = code;
  container.appendChild(codeSpan);

  if (marker) {
    const markerSpan = document.createElement("span");
    markerSpan.className = "hierarchy-marker";
    markerSpan.textContent = marker;
    container.appendChild(markerSpan);
  }

  const subjectSpan = document.createElement("span");
  subjectSpan.className = "hierarchy-subject";
  subjectSpan.textContent = normalizeSubjectText(subject);
  container.appendChild(subjectSpan);
}

function isHierarchyMatch(code, subject, query) {
  if (!query) return true;
  const haystack = `${code} ${subject || ""}`.toLowerCase();
  return haystack.includes(query);
}

function filterChildrenTree(nodes, query) {
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

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeSubjectText(subject) {
  return String(subject || "").replace(/\s+/g, " ").trim();
}

function normalizeMetaText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function hasMetaValue(value) {
  const normalized = normalizeMetaText(value);
  return normalized !== "" && normalized.toUpperCase() !== "NONE";
}

function getActiveEntry() {
  return state.activeCode ? state.jsonIndex.get(state.activeCode) : null;
}

function updateMetaButtons() {
  const hasActiveCode = Boolean(state.activeCode);
  els.showFullDefinitionBtn.disabled = !hasActiveCode;
  els.showNoteBtn.disabled = !hasActiveCode;
  els.showWarningBtn.disabled = !hasActiveCode;
  els.showFullDefinitionBtn.classList.toggle("active", state.metaView === "FULL_DEFINITION");
  els.showNoteBtn.classList.toggle("active", state.metaView === "NOTE");
  els.showWarningBtn.classList.toggle("active", state.metaView === "WARNING");
}

function toggleMetaView(field) {
  if (!state.activeCode) return;

  if (state.metaView === field && !els.codeMetaPanel.hidden) {
    state.metaView = "";
    hideMetaPanel();
    updateMetaButtons();
    return;
  }

  state.metaView = field;
  renderActiveMetaPanel();
  updateMetaButtons();
}

function hideMetaPanel() {
  els.codeMetaPanel.hidden = true;
  els.codeMetaTitle.textContent = "";
  els.codeMetaBody.textContent = "";
}

function renderActiveMetaPanel() {
  if (!state.metaView || !state.activeCode) {
    hideMetaPanel();
    return;
  }

  const entry = getActiveEntry();
  if (!entry) {
    hideMetaPanel();
    return;
  }

  const field = state.metaView;

  if (field === "FULL_DEFINITION") {
    els.codeMetaTitle.textContent = `${state.activeCode} - Full Definition`;
    els.codeMetaBody.textContent = formatFullDefinition(state.activeCode);
    els.codeMetaPanel.hidden = false;
    return;
  }

  const label = field === "NOTE" ? "Note" : "Warning";
  const rawValue = field === "NOTE" ? entry.NOTE : entry.WARNING;
  const value = normalizeMetaText(rawValue);

  els.codeMetaTitle.textContent = `${state.activeCode} - ${label}`;
  els.codeMetaBody.textContent = hasMetaValue(rawValue)
    ? value
    : `No ${label.toLowerCase()} available for this code.`;
  els.codeMetaPanel.hidden = false;
}

function setStatus(message, isError = false) {
  els.statusText.textContent = message;
  els.statusText.style.color = isError ? "#b91c1c" : "";
}
