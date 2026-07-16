# IPC-CPC Code Extractor and Verifier

This project is a browser-based tool to:
- extract IPC/CPC-style codes from free text,
- convert compact inputs into normalized code format,
- match codes against local classification JSON files,
- explore hierarchy relationships,
- select, copy, and manage IPC/CPC selections.

## Project Layout

```text
classification/
|- database/
|  |- A.json
|  |- B.json
|  |- C.json
|  |- D.json
|  |- E.json
|  |- F.json
|  |- G.json
|  |- H.json
|  `- Y.json
|- verify/
|  |- index.html
|  |- app.js
|  |- hierarchy.html
|  |- hierarchy-viewer.js
|  `- info.txt
`- README.md
```

Notes:
- The app currently uses `verify/index.html` and `verify/app.js`.
- `verify/hierarchy.html`, `verify/hierarchy-viewer.js`, and `verify/info.txt` are not part of the active runtime flow.

## Runtime Flow

1. Page loads `verify/index.html`.
2. `verify/app.js` runs `init()` on `DOMContentLoaded`.
3. User chooses mode (`Extract` or `Convert`) and clicks `Format`.
4. App loads classification data from `../database/*.json` (A, B, C, D, E, F, G, H, Y).
5. Results table is rendered.
6. User can filter/search/sort/select codes.
7. Hierarchy modal provides tree navigation, search, and group links.
8. Selection state is synchronized across table, hierarchy modal, textareas, and chip panel.

## Data Model (JSON)

Each classification record should contain:

```json
{
  "SYMBOL": "E01B1/00",
  "LEVEL": 7,
  "TYPE": "IPC",
  "SUBJECT": "Example subject",
  "NOTE": "",
  "WARNING": "",
  "SELF IPC": "",
  "PARENT": "E01B",
  "CHILDS": "E01B1/02, E01B1/04",
  "SORT": "E0100010000000"
}
```

Fields used by the app:
- `SYMBOL`
- `LEVEL`
- `TYPE`
- `SUBJECT`
- `PARENT`
- `CHILDS`

## Detailed Documentation: `verify/index.html`

### Main Purpose

`verify/index.html` defines:
- page structure,
- CSS theme and component styles,
- control elements bound by JavaScript,
- hierarchy modal container.

### CSS Custom Properties (`:root`)

- `--bg-top`, `--bg-bottom`: page gradient.
- `--card-bg`: surface color.
- `--text`, `--muted`: text colors.
- `--primary`, `--primary-soft`: accent palette.
- `--glass-shadow`: elevation shadow.
- `--radius`: card rounding.
- `--glass-blur`: backdrop blur.

Theme variants:
- `:root[data-theme="dark"]`
- `:root[data-theme="high-contrast"]`

### Key DOM IDs (Consumed by `app.js`)

| ID | Element | Role |
|---|---|---|
| `themeSelect` | `<select>` | Theme selection |
| `modeToggle` | `<input type="checkbox">` | Extract/Convert mode switch |
| `modeInfo` | `<div>` | Mode text label |
| `pasteBtn` | `<button>` | Paste input |
| `clearBtn` | `<button>` | Reset app view |
| `formatBtn` | `<button>` | Execute parsing and matching |
| `inputString` | `<textarea>` | Raw input text |
| `formattedCard` | `<div>` | Wrapper for formatted code output |
| `formattedStrings` | `<textarea>` | Formatted code list |
| `resultsCard` | `<div>` | Wrapper for result table and selection UI |
| `resultsCount` | `<div>` | Result count text |
| `searchInput` | `<input>` | Table search filter |
| `typeFilter` | `<select>` | Table type filter |
| `copySelectedBtn` | `<button>` | Copy all selected codes |
| `toggleMatchedBtn` | `<button>` | Show/hide unmatched rows |
| `resultsTable` | `<table>` | Dynamic results table |
| `textAreas` | `<div>` | Selection area container |
| `ipcBox` | `<textarea>` | Selected IPC codes |
| `cpcBox` | `<textarea>` | Selected CPC codes |
| `copyIpcBtn` | `<button>` | Copy IPC box |
| `copyCpcBtn` | `<button>` | Copy CPC box |
| `selectedPanel` | `<div>` | Right-side selected codes panel |
| `clearIpcSelectedBtn` | `<button>` | Remove all IPC selections |
| `clearCpcSelectedBtn` | `<button>` | Remove all CPC selections |
| `selectedIpcList` | `<div>` | IPC chips host |
| `selectedCpcList` | `<div>` | CPC chips host |
| `fabCopy` | `<button>` | Floating copy action |
| `fabClear` | `<button>` | Floating clear action |
| `loaderOverlay` | `<div>` | Loading spinner overlay |
| `hierarchyModal` | `<div>` | Hierarchy modal root |
| `hierarchyTitle` | `<h2>` | Hierarchy modal title |
| `hierarchyGroupLinks` | `<div>` | Quick links for groups A/B/C/D/E/F/G/H/Y |
| `hierarchyCloseBtn` | `<button>` | Close hierarchy modal |
| `hierarchyContainer` | `<div>` | Dynamic hierarchy content host |

### Major UI Blocks

- Header: title, version, theme selector.
- Input card: mode toggle + text input + quick actions.
- Formatted card: normalized/extracted code output.
- Results card: table, filters, copy buttons, selection area.
- Selected panel: chip-based per-code removal and per-type clear.
- Floating actions: copy selected, clear selections.
- Hierarchy modal: parent/current/children tree with controls.

## Detailed Documentation: `verify/app.js`

## Global Variables (Outside Functions)

| Variable | Type | Purpose |
|---|---|---|
| `DB_FILES` | `string[]` | Database file basenames loaded from `../database`. |
| `state` | `object` | Central app state (codes, map index, selected sets, filters, sort). |
| `els` | `Record<string, HTMLElement>` | Cached DOM references initialized in `init()`. |
| `hierarchyViewState` | `object` | Hierarchy modal state (`activeCode`, `searchQuery`, `immediateChildrenOnly`). |

### `state` Object Fields

| Field | Type | Description |
|---|---|---|
| `dedupCodes` | `string[]` | Parsed and deduplicated input codes. |
| `jsonIndex` | `Map<string, object>` | `SYMBOL -> record` lookup map from database files. |
| `ipcSelected` | `Set<string>` | Selected IPC codes. |
| `cpcSelected` | `Set<string>` | Selected CPC codes. |
| `showUnmatched` | `boolean` | Controls whether unmatched rows are visible. |
| `currentSort` | `{ col: string\|null, dir: 1\|-1 }` | Active table sort metadata. |

### `hierarchyViewState` Fields

| Field | Type | Description |
|---|---|---|
| `activeCode` | `string` | Current hierarchy root code being displayed. |
| `searchQuery` | `string` | Hierarchy search text. |
| `immediateChildrenOnly` | `boolean` | `true`: direct children only, `false`: full descendants. |

## Function Documentation (with Local Variables)

Important note:
- `app.js` contains earlier legacy definitions and newer override definitions.
- The effective runtime implementations are the latest function declarations later in the file.

### Initialization and Theme

#### `init()`
- Purpose: cache DOM nodes and wire all UI events.
- Parameters: none.
- Returns: void.
- Key local variables:
  - `groupLinks`: hierarchy group link container for event delegation.

#### `initTheme()`
- Purpose: load persisted theme and bind `themeSelect` change handler.
- Key local variables:
  - `select`: theme dropdown element.
  - `saved`: theme value from `localStorage`.

#### `applyTheme(name)`
- Purpose: apply selected theme and persist setting.
- Parameters:
  - `name` (`string`): `light`, `dark`, or `high-contrast`.
- Key local variables:
  - `root`: `document.documentElement`.

### Database and Main Processing

#### `loadDatabase()`
- Purpose: fetch all JSON files and build `state.jsonIndex`.
- Returns: `Promise<void>`.
- Key local variables:
  - `files`: nested JSON arrays from all fetch calls.
  - `flat`: flattened record array before indexing.

#### `formatPatentString()`
- Purpose: process user input and render matched results.
- Returns: `Promise<void>`.
- Key local variables:
  - `input`: trimmed raw input string.
  - `codes`: extracted/converted code list before dedupe.

### Table Rendering and Selection

#### `renderTable()` (effective override)
- Purpose: build visible table rows safely with DOM APIs.
- Key local variables:
  - `rows`: derived row models from `state.dedupCodes` and `state.jsonIndex`.
  - `q`: table search query.
  - `col`, `dir`: sort metadata from `state.currentSort`.
  - `thead`, `headRow`, `tbody`: dynamic table DOM nodes.
  - `thSelect`, `selectAll`: select-all header cell and checkbox.
  - Per-row variables:
    - `tr`, `tdCheck`, `cb`, `tdCode`, `codeLink`, `tdVerify`, `verifyLink`.

#### `bindRowChecks()`
- Purpose: sync each row checkbox with selection sets.
- Key local variables:
  - `cb`: each `.rowCheck` input.
  - `code`, `type`: values from checkbox dataset.

#### `bindSelectAll()`
- Purpose: select/unselect all visible matched rows.
- Key local variables:
  - `all`: select-all checkbox element.
  - `cb`, `code`, `type`: per-row update context.

#### `syncSelectAll()`
- Purpose: compute and update select-all checked state.
- Key local variables:
  - `checks`: enabled row checkbox list.
  - `all`: select-all checkbox.

#### `syncVisibleRowChecks()`
- Purpose: update currently rendered table checkboxes from selection sets.
- Key local variables:
  - `cb`: each visible checkbox.
  - `code`, `type`: dataset values.

#### `isChecked(r)`
- Purpose: check if row model code is selected in the correct set.
- Parameters:
  - `r`: row model object.

### User Actions

#### `copySelected()`
- Purpose: copy all selected IPC + CPC codes.
- Key local variables:
  - `all`: combined selected code string.

#### `clearSelections(rerender = true)`
- Purpose: clear both sets and refresh dependent UI.
- Parameters:
  - `rerender` (`boolean`): whether to re-render table after clear.

#### `copyBox(type)`
- Purpose: copy IPC or CPC textarea content.
- Parameters:
  - `type` (`"ipc" | "cpc"`).
- Key local variables:
  - `val`: selected textarea value.

#### `toggleUnmatched()`
- Purpose: flip unmatched visibility and re-render table.

#### `resetApp()`
- Purpose: clear input and hide result containers.

### Parsing Helpers

#### `tokenize(str)`
- Purpose: split raw input into tokens by whitespace/comma/semicolon/newline.

#### `convertCode(raw)`
- Purpose: normalize compact code into `AAAA#/####` style output.
- Key local variables:
  - `t`: sanitized uppercase alphanumeric token.
  - `p1`: first 4 chars.
  - `p2`: group segment (trimmed).
  - `p3`: subgroup segment (trimmed/padded rules applied).

#### `regexExtract(txt)`
- Purpose: extract already formatted codes using regex.

### Utility Functions

#### `pasteFromClipboard()`
- Purpose: paste from clipboard into `inputString` with prompt fallback.

#### `showLoader()` / `hideLoader()`
- Purpose: toggle processing overlay visibility.

#### `debounce(fn, ms)`
- Purpose: debounce a callback.
- Key local variables:
  - `t`: timeout handle in closure.

#### `getLevelMarker(level)`
- Purpose: convert hierarchy level into asterisk marker string.

#### `formatHierarchyDisplay(code, marker, subject)`
- Purpose: create display text for hierarchy entries.
- Key local variables:
  - `spacing`: alignment spacing after marker.

### Hierarchy Tree and Modal

#### `buildChildrenTree(code, depth = 0, visited = new Set())`
- Purpose: recursively build descendant tree.
- Key local variables:
  - `entry`: current symbol record.
  - `children`: node output array.
  - `childCodes`: parsed `CHILDS` list.
  - `upper`, `childEntry`, `node`: child processing variables.

#### `buildImmediateChildren(code)`
- Purpose: build only first-level children list.
- Key local variables:
  - `entry`: current symbol record.
  - `childCode`, `childEntry`: per-child lookup values.

#### `buildHierarchyChain(code)` (effective override)
- Purpose: build `{ parents, current, children }` payload.
- Key local variables:
  - `parents`: upward lineage list.
  - `entry`: current symbol record.
  - `currentParent`, `parentEntry`: parent traversal variables.
  - `children`: derived by toggle mode (immediate vs recursive).

#### `renderTreeNode(node, container, isFirstLevel = true)`
- Purpose: recursively render one hierarchy node and descendants.
- Key local variables:
  - `item`: row container.
  - `level`, `isIPC`: styling and selection routing.
  - `marker`, `displayText`: text rendering helpers.
  - `checkbox`, `textSpan`: interactive DOM nodes.

#### `isHierarchyMatch(code, subject, query)`
- Purpose: text matcher for hierarchy search.
- Key local variables:
  - `hay`: normalized searchable string.

#### `filterChildrenTree(nodes, query)`
- Purpose: filter tree while preserving matching ancestor chains.
- Key local variables:
  - `filteredChildren`: filtered descendants for each node.
  - `selfMatch`: current node match status.

#### `renderHierarchySections(host, hierarchy, query)`
- Purpose: render filtered parent/current/children sections.
- Key local variables:
  - `filteredParents`, `currentMatches`, `filteredChildren`.
  - `renderedAny`: empty-state guard.
  - Section DOM vars: `parentsDiv`, `currentDiv`, `childrenDiv`, `label`, `item`, `textSpan`, `empty`.

#### `renderHierarchyModal()` (effective override)
- Purpose: render hierarchy controls and hierarchy results in modal.
- Key local variables:
  - `container`: hierarchy host.
  - `resultsHost`: section content mount point.
  - `controls`: controls container.
  - `search`: hierarchy search input.
  - `toggleBtn`: immediate-children toggle button.
  - `hierarchy`: computed chain payload.
  - `q`: normalized search query.

#### `openHierarchyFor(code)` (effective override)
- Purpose: open modal and display hierarchy for target code/group.
- Key local variables:
  - `modal`, `closeBtn`: modal controls.
  - `closeModal`: closure to close and cleanup search state.

#### `updateHierarchyGroupLinks()`
- Purpose: update active class on header group links A/B/C/D/E/F/G/H/Y.
- Key local variables:
  - `activeGroup`: current leading group character.

### Selection Synchronization Helpers

#### `handleHierarchyCheckbox(code, isIPC, checked)` (effective override)
- Purpose: apply hierarchy checkbox changes to selection sets and sync all surfaces.

#### `refreshHierarchyIfOpen()`
- Purpose: re-render hierarchy modal only when currently open.
- Key local variables:
  - `modal`: modal root element.

#### `removeSelectedCode(code, type)`
- Purpose: remove one code from selected set and sync UI.

#### `clearTypeSelections(type)`
- Purpose: clear selected codes by type (`IPC` or `CPC`).

#### `renderSelectedChipList(container, codes, type)`
- Purpose: render chip list with open-hierarchy and remove actions.
- Key local variables:
  - `empty`: empty-state span.
  - `chip`, `codeBtn`, `removeBtn`: per-chip DOM nodes.

#### `updateBoxes()` (effective override)
- Purpose: update textareas and chip lists from selection sets.
- Key local variables:
  - `ipcCodes`: array copy of `state.ipcSelected`.
  - `cpcCodes`: array copy of `state.cpcSelected`.

## Search, Sort, and Filter Logic

- Table search: `code + definition + type` contains query.
- Type filter: strict match with dropdown (`IPC`/`CPC`).
- Sort: uses `state.currentSort.col` and `state.currentSort.dir`.
- Hierarchy search: matches `code + subject` over parent/current/children with descendant-preserving tree filter.

## Clipboard and Browser Requirements

- Clipboard API (`navigator.clipboard`) may require secure context in some browsers.
- If `readText` fails, paste falls back to prompt input.

## How to Run

1. Open `verify/index.html` in a browser.
2. Ensure the folder structure keeps `database/` as sibling of `verify/`.
3. Enter/paste text and click `Format`.

## Current Behavior Notes

- Group link buttons in hierarchy header: `A, B, C, D, E, F, G, H, Y`.
- `E` group is loaded (`DB_FILES` includes `E`).
- Right-side selected panel supports per-code removal and per-type bulk removal.

## Suggested Next Refactor (Optional)

- Remove legacy duplicate function blocks and keep only the final override implementations.
- Move inline CSS to a dedicated stylesheet.
- Split hierarchy logic into a separate module.
- Add tests for parser, hierarchy builder, and selection synchronization.
