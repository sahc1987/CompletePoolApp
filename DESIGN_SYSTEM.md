# Design System: CompletePoolApp

Status: Complete

Source of truth for web tokens: `tailwind.config.ts` and `src/app/globals.css`. Do not hard-code hex values in components; use the tokens.

## Tone and brand
Clean, professional and high-contrast. The app is read on a phone in direct sun, so every text level must pass contrast. Brand colors are royal blue and cyan-teal, with gold as a minor warm highlight. No stock photos inside the app; icons are simple line icons.

## Color tokens
Light theme only. Dark theme is deferred; when added, define it as a second token set rather than per-component overrides.

| Token | Value | Use |
|---|---|---|
| `navy-900` / `navy-700` / `navy-500` | #0b2a63 / #1a56db / #3f74e3 | Deep accents, nav and links, hovers |
| `chrome-400` / `chrome-100` | #8fb2f5 / #e9f1ff | Light blue tints, subtle panels |
| `teal-700` | #0e7490 | Primary CTA (white text 5.36:1), focus ring |
| `teal-800` / `teal-900` | #0a5f77 / #06414a | CTA hover, text on bright teal |
| `teal-500` / `400` / `300` | #14b8c9 / #3dd0de / #8fe3ec | Accents on dark surfaces only; never as text on white |
| `gold-600/500/400` | #de911d / #f0b429 / #f7c948 | Minor warm highlights |
| `night` | #0f1622 | Dark feature sections |
| `surface` | #f4f7fc | App background |
| `ink` | #1a2333 | Body text (15.76:1) |
| `muted` | #5b6784 | Secondary text (5.65:1) |
| `faint` | #63708c | Tertiary text, placeholders (4.97:1) |
| `line` / `field` | #dbe3ee / #7a8cae | Decorative borders / input borders (3.39:1) |
| `warn` | #b45309 | Needs attention (low stock) |
| `pending` | #475569 | Not yet done |
| `aqua` | #0e7490 | In progress |
| `danger` | #b91c1c | Errors, destructive |
| `good` | #166534 | Success |

Shadows: `--shadow-card`, `--shadow-lift` in `globals.css`.

## Typography scale
Inter via `next/font` (`--font-inter`), fallback `system-ui, sans-serif`. Use Tailwind's size scale: `text-xs` (12), `text-sm` (14), `text-base` (16, body), `text-lg` (18), `text-xl` (20), `text-2xl` (24), `text-3xl` (30) for page titles. Weights: 400 body, 500 labels, 600 headings. Body text never goes below 14px on mobile.

## Spacing and radius scale
Tailwind's 4px spacing scale (`1`=4px, `2`=8px, `3`=12px, `4`=16px, `6`=24px, `8`=32px). Radius: `rounded-lg` for inputs and cards, `rounded-full` for CTA pills and chips. Minimum touch target 44x44px.

## Core components
Buttons (primary teal pill, secondary white pill with `line` border, destructive `danger`), inputs with `field` border, cards with `--shadow-card`, status chips (`pending`, `aqua`, `good`, `warn`, `danger`), calendar (FullCalendar themed under `.calendar-shell`), tables, modals, toasts/notifications, PDF documents (invoice, receipt, estimate), and the Leaflet map on mobile. Build new UI from these before creating new variants.

## Responsive breakpoints
Mobile-first with Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. The office views are designed for `md` and up; worker views must work at 360px width with no horizontal scroll.

## Accessibility target
WCAG 2.2 AA. Text 4.5:1, UI component boundaries 3:1, visible `:focus-visible` outline (teal 2px), full keyboard operation, semantic HTML and labelled inputs. Never rely on color alone for status; pair it with text or an icon.

## Languages / i18n
English only. Keep user-facing strings in plain components for now; if a second language is added, extract strings first. Dates and times render in the business timezone (see `src/lib/timezone.ts`).

## Icons and imagery
Simple line icons only. No stock photography in the app UI. Task photos are user content, shown via signed URLs.
