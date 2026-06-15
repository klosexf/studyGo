# Logic Expression SaaS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the logic-expression training prototype as a three-zone SaaS dashboard matching the supplied reference while preserving every P-01 through P-08 workflow.

**Architecture:** Use one standalone HTML document with inline CSS and vanilla JavaScript. Desktop uses a dark sidebar, primary workspace, and dynamic summary rail; smaller screens collapse the rail and convert navigation to horizontal scrolling.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node-based static structure tests, Chrome headless screenshots.

---

### Task 1: Define Regression Tests

**Files:**
- Modify: `/Users/chenxiaofeng/Documents/Tare code file/studyGo/test-ui-structure.js`
- Modify: `/Users/chenxiaofeng/Documents/Tare code file/studyGo/test-ui-palette.js`

- [ ] **Step 1: Require all eight wireframe states**

The structure test must require:

```text
data-view="dashboard"
data-view="setup"
data-view="topic"
data-view="draft"
data-view="diagnosis"
data-view="result"
data-action="open-history"
data-action="open-settings"
```

- [ ] **Step 2: Require the three-zone reference layout**

The test must also require:

```text
class="app-shell"
class="sidebar"
class="workspace"
class="insights-rail"
class="donut-chart"
class="bar-chart"
```

- [ ] **Step 3: Require the reference palette**

The palette test must require charcoal, ivory, sage, yellow, and lavender variables and reject the prior paper-grid palette.

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
node test-ui-structure.js
node test-ui-palette.js
```

Expected: at least one test fails because the current HTML does not contain the new three-zone shell and palette.

### Task 2: Rebuild The HTML Prototype

**Files:**
- Modify: `/Users/chenxiaofeng/Documents/Tare code file/studyGo/逻辑表达训练产品_UI效果图.html`

- [ ] **Step 1: Build the application shell**

Create:

- Outer warm-gray canvas.
- Rounded `.app-shell`.
- Dark `.sidebar`.
- Ivory `.workspace`.
- Tinted `.insights-rail`.

- [ ] **Step 2: Implement P-01 through P-06**

Render each required screen as a `data-view` section using the reference component system:

- Dashboard metrics, bar chart, order/history list.
- Setup choices and recommendation.
- Topic confirmation.
- Draft editor with live character count.
- Diagnosis and rewrite editor.
- Result metrics and comparison.

- [ ] **Step 3: Implement P-07 and P-08**

Add:

- History drawer with filter controls.
- Local data modal with close and destructive action.

- [ ] **Step 4: Implement dynamic summary rail**

The right rail must update title, donut/progress content, recommendation, and recent items when the active screen changes.

- [ ] **Step 5: Implement interactions**

Support:

- Sidebar navigation.
- Workflow stage navigation.
- CTA progression.
- Scenario and difficulty selection.
- Character counting.
- History and settings overlays.
- Escape-to-close.

- [ ] **Step 6: Implement responsive layout**

Use media queries at approximately 1180px and 760px to collapse the summary rail and convert navigation to a mobile layout without overlap.

### Task 3: Verify Structure And Rendering

**Files:**
- Verify: `/Users/chenxiaofeng/Documents/Tare code file/studyGo/逻辑表达训练产品_UI效果图.html`

- [ ] **Step 1: Run structural tests**

Run:

```bash
node test-ui-structure.js
node test-ui-palette.js
```

Expected:

```text
ui-structure-ok
ui-palette-ok
```

- [ ] **Step 2: Check HTML completeness**

Run:

```bash
node -e "const fs=require('fs'); const h=fs.readFileSync('逻辑表达训练产品_UI效果图.html','utf8'); console.log(h.includes('<!doctype html>')&&h.includes('</script>')&&h.includes('</html>')?'html-ok':'html-missing')"
```

Expected:

```text
html-ok
```

- [ ] **Step 3: Render desktop and mobile screenshots**

Serve the directory locally and use Chrome headless at:

```text
1440x1050
390x844
```

- [ ] **Step 4: Review screenshots**

Verify:

- Desktop visibly uses all three zones.
- Reference palette and rounded component language are present.
- Mobile content is single-column and readable.
- No text or controls overlap.

### Self-Review

- All P-01 through P-08 requirements map to an implementation task.
- The design follows the newly supplied reference, not the previous warm-paper design.
- The final artifact remains a single HTML file.
- The workspace is not a git repository, so commit steps are omitted.
