# Logic Expression SaaS Dashboard Design

## Goal

Convert every wireframe in `逻辑表达训练产品 · 页面清单与线框流程图.md` into a polished, interactive, single-file HTML prototype based on the newly supplied SaaS dashboard reference.

## Reference Style Extraction

### Layout

- A large rounded application shell centered on a warm neutral page background.
- Three desktop zones:
  - Fixed dark sidebar for identity and navigation.
  - Wide primary workspace for tasks, charts, editors, and comparisons.
  - Narrow summary rail for progress distribution, recommendations, and recent records.
- Clear separation through background blocks rather than heavy borders.

### Color System

- Outer canvas: warm stone gray.
- Main workspace: ivory and warm off-white.
- Sidebar: charcoal black.
- Active navigation accent: muted yellow.
- Data accents:
  - Sage green for logic and stable progress.
  - Soft yellow for expression and attention states.
  - Lavender for training progress and upgrade/rewrite states.
  - Charcoal for primary data marks and strong actions.
- Text: near-black primary text and warm gray secondary text.

### Typography

- Large, heavy numeric values and screen headings.
- Medium-weight section titles.
- Small, low-contrast metadata and helper text.
- No decorative travel, nature, paper-craft, or editorial typography.

### Components

- Large rounded metric cards with flat pastel fills.
- Thick rounded bar charts.
- Donut charts with nearby percentage labels.
- White list rows floating on a tinted rail.
- Search field and compact utility buttons.
- Navigation rows with simple icons and a slim active indicator.
- Inputs and editors with soft backgrounds, large radii, and restrained focus rings.

### Motion

- Screen content fades and moves upward slightly when changed.
- Cards lift subtly on hover.
- Navigation and stage controls animate color changes.
- Drawer and modal use short slide/fade transitions.

## Information Architecture

The prototype preserves all wireframe screens:

1. P-01 Home / training dashboard.
2. P-02 Training setup.
3. P-03 Topic confirmation.
4. P-04 Draft writing panel.
5. P-05 Diagnosis and rewrite panel.
6. P-06 Result review.
7. P-07 History drawer.
8. P-08 Local data settings modal.

## Desktop Composition

### Sidebar

- Product mark and product name.
- Compact user/training profile block.
- Navigation for dashboard and all training stages.
- History and settings actions.
- Local-only state and a bottom action.

### Main Workspace

- Top heading and search/utility area.
- Stage-specific primary content.
- Dashboard metrics, trend charts, topic cards, editors, diagnosis blocks, and result comparison.
- Main actions remain visually dominant but use charcoal, sage, yellow, or lavender according to state.

### Summary Rail

- Dashboard: ability donut, weakness percentages, recent training list.
- Setup: current recommendation and recent weaknesses.
- Topic/draft: constraints and current training metadata.
- Diagnosis: score snapshot and key question.
- Result: improvement summary and next practice recommendation.

The summary rail changes with the selected screen so that it remains useful throughout the workflow.

## Screen Mapping

### Dashboard

- Three pastel metric cards: logic score, expression score, rewrite improvement.
- Seven-session rounded bar chart.
- Recent training/orders-style list.
- Right-side ability donut and recent history rows.

### Setup

- Scenario selection cards.
- Difficulty segmented control.
- System recommendation card.
- Generation readiness summary in the right rail.

### Topic

- Structured topic card with background, question, task, constraints, and scoring focus.
- Regenerate and start-writing actions.
- Right rail shows topic metadata and quality checks.

### Draft

- Topic summary beside a large writing editor.
- Live character count.
- Right rail keeps constraints and writing hints visible.

### Diagnosis

- AI diagnosis rows for summary, logic issue, expression issue, and Socratic question.
- Rewrite editor.
- Right rail shows before scores and the required rewrite objective.

### Result

- Logic, expression, and confidence metrics.
- Draft versus rewrite comparison.
- Improvement checklist and remaining issue.
- Right rail shows total improvement and next practice.

### History And Settings

- History appears as a right-side drawer with filter controls and result links.
- Local data settings appears as a centered modal with explanation and destructive action.

## Responsive Behavior

- Above 1180px: three-column shell.
- From 760px to 1179px: dark sidebar plus main workspace; summary rail becomes an inline section.
- Below 760px: top horizontal navigation, single-column screen content, horizontally scrollable stage control, full-width drawer, and compact modal.
- Text, metrics, charts, and buttons must not overflow their containers.

## Interaction Requirements

- Sidebar navigation switches screens.
- Stage control switches workflow stages.
- CTA buttons advance or return through the workflow.
- Scenario and difficulty controls update selected states.
- Draft editor updates character count.
- History drawer opens, filters visually, and closes.
- Settings modal opens and closes.
- Escape closes overlays.
- Hover and focus states are visible.

## Delivery

Replace `逻辑表达训练产品_UI效果图.html` with a standalone HTML file containing all HTML, CSS, and JavaScript. It must not require external assets or a build process.
