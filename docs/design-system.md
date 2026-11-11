# EDI NEXUS — Design System, Tokens & Component Architecture

## 1. Design Philosophy
EDI NEXUS is an enterprise Management Information System for Electronic Data Interchange (EDI) transactions between trading partners. Its visual language prioritizes operational clarity, scannable density, disciplined whitespace, hairline borders, and zero visual noise.

- **Avoided patterns**: No gradients, no glassmorphism, no heavy shadows, no oversized hero KPI cards, no decorative illustrations or unnecessary animations.
- **Visual inspiration**: Restrained B2B precision (Linear, Stripe, Ramp, Attio) adapted to structured enterprise MIS tables, workflows, and compliance telemetry.

---

## 2. Design Tokens

### 2.1 Color System
| Token | Hex / Value | Usage |
|---|---|---|
| `--bg-canvas` | `#F6F8FA` | Primary application background |
| `--bg-surface` | `#FFFFFF` | Cards, sidebar, topbar, tables, modals |
| `--bg-surface-subtle` | `#F9FAFB` | Table header cells, nested detail wells, hover states |
| `--bg-surface-muted` | `#F1F4F8` | Active sidebar item tint, subtle badge backgrounds |
| `--border-default` | `#E2E7EE` | Primary `1px` structural border for cards, sidebar, topbar |
| `--border-subtle` | `#EDF1F5` | Table row dividers, inner card dividers |
| `--border-strong` | `#CBD5E1` | Input borders, interactive outlines on hover |
| `--text-primary` | `#172B4D` | Headings, primary values, strong labels, active nav text |
| `--text-secondary` | `#42526E` | Table body text, descriptions, secondary labels |
| `--text-muted` | `#6B778C` | Metadata, timestamps, uppercase section titles, helper copy |
| `--accent-primary` | `#172B4D` | Primary action buttons, active sidebar indicator bar |
| `--accent-interactive` | `#1E4E8C` | Links, chart primary series, focus ring, interactive highlights |
| `--status-success` | `#168568` | Accepted documents, healthy partner status, valid checks |
| `--status-success-bg` | `#ECF7F3` | Accepted badge fill |
| `--status-success-border` | `#B8E2D4` | Accepted badge border |
| `--status-warning` | `#D69A35` | Pending transactions, awaiting acknowledgement, draft |
| `--status-warning-bg` | `#FDF7EB` | Pending badge fill |
| `--status-warning-border` | `#F1DBA8` | Pending badge border |
| `--status-danger` | `#D9534F` | Rejected documents, mismatches, validation exceptions |
| `--status-danger-bg` | `#FDF1F1` | Rejected badge fill |
| `--status-danger-border` | `#F3C2C0` | Rejected badge border |
| `--status-info` | `#1E4E8C` | Processing / Submitted EDI states |
| `--status-info-bg` | `#EFF4FB` | Processing badge fill |
| `--status-info-border` | `#C5D7EE` | Processing badge border |

### 2.2 Typography
- **Primary Font**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Monospace / Tabular Font**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
- **Scale & Hierarchy**:
  - Page Title (`H1`): `20px` (`1.25rem`), `600`, tracking `-0.02em`, `#172B4D`
  - Section / Card Title (`H2`): `14px` (`0.875rem`), `600`, tracking `-0.01em`, `#172B4D`
  - Sidebar Group Label: `11px` (`0.6875rem`), `600`, uppercase, tracking `0.06em`, `#6B778C`
  - KPI Metric Value: `26px` (`1.625rem`), `600`, `tabular-nums`, tracking `-0.02em`, `#172B4D`
  - Body / Table Cell: `13px` (`0.8125rem`), `400/500`, `#42526E`
  - Caption / Timestamp: `12px` (`0.75rem`), `400`, `#6B778C`
  - Currency & Numeric Alignment: `tabular-nums`, Indian Rupee grouping (`en-IN`, e.g., `₹45,00,000`).

### 2.3 Layout, Spacing & Elevation
- **Sidebar Width**: `248px` fixed on desktop (`>=1024px`), slide-over drawer on mobile/tablet.
- **Top Navigation Height**: `56px` sticky header (`#FFFFFF` + `1px solid #E2E7EE`).
- **Workspace Container**: `max-w-[1440px]`, padding `24px` desktop / `16px` mobile.
- **Grid**: 12-column responsive CSS grid, `16px` gap.
- **Border Radius**: `8px` for cards/dialogs, `6px` for inputs/buttons/nav items, `4px` for compact badges.
- **Elevation**: Flat `1px solid #E2E7EE` borders; minimal subtle shadow (`0 1px 2px rgba(23, 43, 77, 0.04)`) only for dropdown popovers/modals.

---

## 3. Reusable Component System

### 3.1 Layout Components (`src/components/layout/`)
1. **`AppShell`**: Fixed sidebar + responsive mobile drawer + sticky topbar + main scrollable workspace + global quick-search handler.
2. **`Sidebar`**: Brand mark (`EDI NEXUS`), exact 5 navigation groups (`OVERVIEW`, `TRANSACTION MANAGEMENT`, `BUSINESS NETWORK`, `INTELLIGENCE`, `SYSTEM`), active indicator bar (`#172B4D`), and workspace partner context footer.
3. **`Topbar`**: Current page title & subtitle/breadcrumb, interactive search bar (`Ctrl+K` / instant filter trigger), Notifications popover (live pending ack & exception alerts), and User/Operator Profile menu.

### 3.2 UI Primitives (`src/components/ui/`) — shadcn/ui style
- `Button` (variants: `primary`, `secondary`, `outline`, `ghost`, `danger`; sizes: `sm`, `md`, `icon`)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Badge` (semantic variants: `success`, `warning`, `danger`, `info`, `neutral`)
- `Input`, `Select`
- `Table` (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`)
- `Popover` / `DropdownMenu` (lightweight accessible overlays for notifications & profile menu)

### 3.3 Domain Shared Components (`src/components/shared/`)
1. **`PageHeader`**: Consistent title, concise context subtitle, optional demo-data notice pill, and right-aligned action slots.
2. **`KpiCard`**: Clean metric label, large `tabular-nums` value, compact delta/meta line, and restrained corner icon.
3. **`StatusBadge`**: Maps EDI workflow states (`Accepted`, `Pending`, `Rejected`, `Processing`, `Draft`) directly to `#168568`, `#D69A35`, `#D9534F`, and `#1E4E8C` semantic tokens.
4. **`DocTypeBadge`**: Standard ANSI X12 document badge (`850 PO`, `855 POA`, `810 INV`, `856 ASN`) with code + human label.
5. **`DataTableShell` / `EmptyState`**: Standardized enterprise table headers, row hover states, empty-state handling, and pagination footer patterns.

