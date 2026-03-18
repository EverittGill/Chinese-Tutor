# Everitt's Style Guide

A complete reference for the visual design language of the Eugenia / Aim Assist application. This document covers the design ethos, color systems, typography, component patterns, theme switching, and everything you need to build new features that feel like they belong.

---

## Design Ethos

This app was built by someone who actually uses it in the field — at a desk, in the car, and at the beach under direct sunlight. The style reflects three core beliefs:

1. **Warmth over sterility.** Default corporate blues and grays feel cold. This app uses tans, caramels, and earth tones that feel human and approachable, like a well-worn leather notebook. Every color has a warm undertone.

2. **Readability is non-negotiable.** If you can't read it, it doesn't matter how pretty it is. The entire Beach Mode exists because most apps become unusable in sunlight. Readability comes first, aesthetics serve it.

3. **Stay out of the way.** This is a tool for managing real conversations with real people. The UI should feel invisible — no flashy animations, no clever tricks, no UI that draws attention to itself. Transitions are fast (200ms), shadows are subtle, and the content is always the star.

### What "On Brand" Looks Like

- Backgrounds are warm, not white — think cream, linen, parchment
- Buttons feel solid and tactile, not flat and lifeless
- Text is dark and readable, never light gray on white
- Borders are subtle and warm, never harsh
- Hover states are gentle shifts, not dramatic color swaps
- Everything feels like it belongs in the same warm room

### What to Avoid

- Pure white (`#FFFFFF`) backgrounds in Light mode — use `warm-50` (`#FDFCFA`) instead
- Cool grays or blues as neutral colors
- Thin, low-contrast text
- Heavy drop shadows or glowing effects
- Animations longer than 200ms
- Decorative elements that don't serve a function

---

## The Three Themes

The app ships with three themes that cycle in order: **Light** -> **Dark** -> **Beach** -> **Light**. Each is a complete DaisyUI theme defined via CSS custom properties.

### Light Theme (`eugenia`)

The default. Warm, professional, easy on the eyes indoors.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | Warm tan | `#C4A08B` | Buttons, active states, brand accents |
| Secondary | Soft caramel | `#C8A180` | Secondary buttons, subtle highlights |
| Accent | Bronze | `#BE8F6A` | Call-to-action elements, emphasis |
| Neutral | Warm gray | `#73706A` | Borders, muted text, dividers |
| Base-100 | Cream | `#FDFCFA` | Main background |
| Base-200 | Linen | `#F8F6F2` | Cards, panels, navbar |
| Base-300 | Warm gray | `#F0EDEA` | Borders, separators |
| Base Content | Dark brown | `#2A271F` | All body text |

**Design intent:** Everything warm. The background isn't white, it's cream. The text isn't black, it's dark brown. Even the grays have warm undertones. This prevents eye fatigue during long sessions.

### Dark Theme (`eugenia-dark`)

For nighttime use and low-light environments.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | Light tan | `#D0B5A3` | Buttons, active states (lighter for visibility) |
| Secondary | Soft beige | `#D2B397` | Secondary elements |
| Accent | Pale sand | `#DCC4AD` | Emphasis elements |
| Neutral | Medium warm gray | `#A8A19A` | Borders, muted elements |
| Base-100 | Deep brown | `#2A271F` | Main background |
| Base-200 | Dark olive | `#4A473F` | Cards, panels |
| Base-300 | Warm gray | `#73706A` | Borders, dividers |
| Base Content | Light cream | `#F8F6F2` | All body text |

**Design intent:** Not just "invert the colors." The dark background is a deep warm brown, not a cold black or gray. Primary/secondary colors are lightened so they remain visible and feel consistent with the light theme's warmth.

### Beach Mode (`eugenia-beach`)

Maximum readability in direct sunlight. This is a utility mode, not a beauty contest.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | Bold orange | `#D84315` | Highly visible action buttons |
| Secondary | Deep teal | `#005662` | High-contrast secondary elements |
| Accent | Bright amber | `#FF6F00` | Maximum visibility accents |
| Neutral | Dark gray | `#404040` | Borders |
| Base-100 | Off-white | `#FAFAF5` | Main background (reduces glare vs pure white) |
| Base Content | Charcoal | `#1A1A1A` | Maximum contrast text |

**But it doesn't stop there.** Beach Mode also applies aggressive CSS overrides:

- **All text is bold** (`font-weight: 700`) with no exceptions
- **Base font size jumps to 120%**, minimum 18px for any text element
- **Headings go huge**: h1 = 2.5rem, h2 = 2rem, h3 = 1.75rem (all weight 900)
- **All shadows and gradients are stripped** — flat, solid colors only
- **Buttons get 3px black borders**, uppercase text, extra padding, min-height 3.5rem
- **Inputs get 3px black borders** on yellow backgrounds
- **Modals get 5px black borders**
- **Scrollbars double in width** (16px) with black thumbs on yellow tracks
- **Links are always underlined** with 2px thickness
- **All opacity effects are removed** — everything is full opacity
- **Font switches to Arial/Helvetica/Verdana** for maximum screen legibility

**Design intent:** When the Florida sun is hitting your screen, subtlety is your enemy. Beach Mode throws out elegance in favor of raw, aggressive readability. Black on yellow is the highest-contrast color combination that exists. Every element has thick borders so you can see where things start and end.

---

## How Theme Switching Works

### The Toggle Cycle

Themes cycle in a fixed order via a single button in the navbar:

```
Light (eugenia) -> Dark (eugenia-dark) -> Beach (eugenia-beach) -> Light (eugenia)
```

### The Icon System

The theme toggle button shows the icon of the *next* theme in the cycle:

| Current Theme | Icon Shown | Tooltip |
|---------------|------------|---------|
| Light | Waves | "Switch to dark mode" |
| Dark | Sun | "Switch to beach mode" |
| Beach | Moon | "Switch to light mode" |

### Technical Implementation

**ThemeContext** (`src/contexts/ThemeContext.js`):
- Stores the current theme name in React state
- Persists to `localStorage` under the key `eugenia-theme`
- Sets `data-theme` attribute on both `<html>` and `<body>` elements
- Exposes `theme`, `setTheme`, `toggleTheme`, `isDark`, `isBeach`, `isLight`

**How to use in a component:**
```jsx
import { useTheme } from '../contexts/ThemeContext';

const MyComponent = () => {
  const { isDark, isBeach, isLight, toggleTheme } = useTheme();

  return (
    <div className="bg-base-100 text-base-content">
      {isBeach && <p>You're in Beach Mode!</p>}
    </div>
  );
};
```

**How themes are applied in CSS:**
```css
/* Target a specific theme */
[data-theme="eugenia"] .my-element { /* light mode styles */ }
[data-theme="eugenia-dark"] .my-element { /* dark mode styles */ }
[data-theme="eugenia-beach"] .my-element { /* beach mode styles */ }
```

**Key rule:** Use DaisyUI semantic classes (`bg-base-100`, `text-base-content`, `text-primary`, etc.) instead of hardcoded colors whenever possible. This makes your component automatically theme-aware without writing per-theme CSS.

---

## Color System Deep Dive

### Brand Colors (Tailwind Extended)

Defined in `tailwind.config.js` under `theme.extend.colors`:

```
brand-50:  #FBF8F3  (lightest cream)
brand-100: #F2EDE3
brand-200: #E8DDD0
brand-300: #DCCABA
brand-400: #D0B5A3
brand-500: #C4A08B  <- Main brand color
brand-600: #B8936F
brand-700: #A68660
brand-800: #8F7451
brand-900: #756142  (deep caramel)
```

### Accent Colors

```
accent-50:  #F9F6F1
accent-100: #F0E8DA
accent-200: #E6D6C3
accent-300: #DCC4AD
accent-400: #D2B397
accent-500: #C8A180  <- Main accent
accent-600: #BE8F6A
accent-700: #B47D54
accent-800: #AA6B3E
accent-900: #A05928  (deep bronze)
```

### Warm Grays

These replace standard gray scales everywhere:

```
warm-50:  #FDFCFA  (the "white" of this app)
warm-100: #F8F6F2
warm-200: #F0EDEA
warm-300: #E7E3DF
warm-400: #DDD8D2
warm-500: #C9C3BB
warm-600: #A8A19A
warm-700: #73706A
warm-800: #4A473F
warm-900: #2A271F  (the "black" of this app)
```

### Status Colors

Status colors have warm undertones and include light variants for backgrounds:

| Status | Default | Dark | Light (background) |
|--------|---------|------|---------------------|
| Success | `#8BC34A` | `#689F38` | `#F0F9E8` |
| Warning | `#FF9800` | `#F57C00` | `#FFF8E1` |
| Error | `#F44336` | `#D32F2F` | `#FFEBEE` |
| Info | `#2196F3` | `#1976D2` | `#E3F2FD` |

---

## Typography

### Font Stack

```css
/* Default (Light & Dark) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

/* Beach Mode override */
font-family: Arial, Helvetica, Verdana, sans-serif;

/* Monospace */
font-family: Monaco, Courier, monospace;
```

### Beach Mode Typography Rules

These are enforced via CSS `!important` overrides in `App.css`:

- Base font-size: `120%`
- Line-height: `1.8`
- All elements: `font-weight: 700`, `letter-spacing: 0.02em`
- Paragraphs, spans, divs: minimum `18px`
- h1: `2.5rem`, weight `900`
- h2: `2rem`, weight `900`
- h3: `1.75rem`, weight `900`

---

## Component Patterns

### Buttons

Use DaisyUI button classes. The custom theme handles colors automatically.

```jsx
{/* Primary action */}
<button className="btn btn-primary">Save Lead</button>

{/* Secondary action */}
<button className="btn btn-secondary">Cancel</button>

{/* Ghost (navbar icons, subtle actions) */}
<button className="btn btn-ghost btn-circle btn-sm w-9 h-9">
  <SettingsIcon size={20} />
</button>

{/* Standard hover pattern for navbar icons */}
<button className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-base-content hover:text-primary hover:bg-primary/20 transition-colors duration-warm">
  <Icon size={20} />
</button>
```

**Beach Mode auto-overrides for buttons:**
- Padding increases to `1rem 2rem`
- Weight jumps to `900`
- 3px solid black border
- Text goes uppercase with `0.1em` letter-spacing
- Minimum height: `3.5rem`

### Inputs

```jsx
<input
  type="text"
  placeholder="Search leads..."
  className="input input-bordered input-sm w-full bg-base-100/90 focus:bg-base-100 pl-9 pr-3 h-9"
/>
```

**Focus state:** Inputs get a primary-colored outline ring on focus:
```css
.input:focus {
  outline: 2px solid hsl(var(--p));
  border-color: hsl(var(--p));
}
```

### Cards and Panels

```jsx
<div className="bg-base-200/90 backdrop-blur-md shadow-warm-md border-b border-base-300 rounded-lg p-4">
  {/* Card content */}
</div>
```

**Key patterns:**
- Background: `bg-base-200` or `bg-base-100` with optional `/90` opacity
- `backdrop-blur-md` for frosted glass effect (stripped in Beach Mode)
- Borders: `border border-base-300`
- Shadows: Use `shadow-warm-sm`, `shadow-warm-md`, `shadow-warm-lg`, or `shadow-warm-xl`
- Rounded corners: `rounded-lg` (overridden to `0.25rem` in Beach Mode)

### The Navbar

```jsx
<nav className="navbar bg-base-200/90 backdrop-blur-md shadow-warm-md border-b border-base-300 md:sticky md:top-0 z-[51] px-6 py-3 min-h-[4rem]">
```

This is the gold-standard container pattern: warm background, blurred backdrop, subtle shadow, thin bottom border, sticky positioning.

### Scrollbars

Custom styled per theme in `App.css`:

- **Light & Dark:** 8px width, themed track/thumb colors, 4px border-radius
- **Beach:** 16px width, black thumb on yellow track, no border-radius, 2px borders

---

## Shadows

Custom warm shadows replace the default Tailwind set:

```
shadow-warm-sm: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)
shadow-warm-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
shadow-warm-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
shadow-warm-xl: 0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)
```

These are deliberately softer than Tailwind defaults. Shadows should feel like a gentle lift, not a heavy drop.

**Beach Mode strips all shadows.** Every element is flat.

---

## Transitions

```css
transition-duration: 200ms;          /* "duration-warm" in Tailwind */
transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);  /* "ease-warm" */
```

Use `transition-colors duration-warm` for hover effects. Keep animations snappy — 200ms max. This app isn't a portfolio piece, it's a work tool.

---

## How to Build Something New in This Style

### Step-by-Step Checklist

1. **Use semantic DaisyUI classes** for colors (`bg-base-100`, `text-primary`, `border-base-300`). This gets you theme support for free.

2. **Use warm shadows** (`shadow-warm-md`) instead of Tailwind defaults.

3. **Use warm grays** from the extended palette when you need specific colors outside the DaisyUI variables.

4. **Test in all three themes.** Toggle through Light, Dark, and Beach to make sure nothing breaks.

5. **If Beach Mode needs special treatment**, add overrides in `App.css` scoped to `[data-theme="eugenia-beach"]`. Common needs:
   - Increase font size or weight
   - Add thick black borders
   - Replace subtle colors with high-contrast alternatives
   - Remove shadows, gradients, or transparency

6. **Use `200ms` transitions** with the warm timing function. No springy bounces, no slow fades.

7. **Check contrast.** Light mode text should be `warm-900` on `warm-50`. Dark mode text should be `warm-100` on `warm-900`. Beach mode is always black on yellow/white.

### Example: Building a New Settings Card

```jsx
const SettingsCard = ({ title, children }) => {
  return (
    <div className="bg-base-100 border border-base-300 rounded-lg shadow-warm-sm p-6">
      <h3 className="text-lg font-semibold text-base-content mb-4">{title}</h3>
      <div className="space-y-3 text-base-content">
        {children}
      </div>
    </div>
  );
};
```

This will automatically look correct in all three themes because it uses only semantic classes.

### Example: A Component That Needs Beach Mode Tweaks

```jsx
{/* Component */}
<div className="status-badge rounded-full px-3 py-1 text-sm bg-primary/20 text-primary">
  Active
</div>
```

```css
/* In App.css - Beach mode needs more contrast */
[data-theme="eugenia-beach"] .status-badge {
  background-color: #000000 !important;
  color: #FFFF00 !important;
  border: 2px solid #000000 !important;
  border-radius: 0.25rem !important;
  font-size: 1rem !important;
}
```

---

## File Map

| File | What It Does |
|------|-------------|
| `tailwind.config.js` | Brand colors, warm grays, shadows, DaisyUI theme definitions |
| `src/daisyui-themes.css` | CSS custom properties for all three themes + base component styles |
| `src/App.css` | Scrollbar styles, Beach Mode typography/layout overrides |
| `src/search-fix.css` | Search input positioning and Beach Mode search styling |
| `src/index.css` | Tailwind directive imports (base, components, utilities) |
| `src/contexts/ThemeContext.js` | Theme state management, localStorage persistence, toggle logic |
| `src/components/NavBar.js` | Theme toggle button with cycling icons |

---

## Quick Reference: DaisyUI CSS Variables

These are the HSL values set by each theme. Use them via `hsl(var(--variable))` in custom CSS:

| Variable | Purpose |
|----------|---------|
| `--p` | Primary color |
| `--pf` | Primary focus/hover |
| `--pc` | Primary content (text on primary) |
| `--s` | Secondary color |
| `--a` | Accent color |
| `--n` | Neutral color |
| `--nc` | Neutral content |
| `--b1` | Base-100 (main background) |
| `--b2` | Base-200 (card/panel background) |
| `--b3` | Base-300 (borders/dividers) |
| `--bc` | Base content (main text color) |
| `--in` | Info |
| `--su` | Success |
| `--wa` | Warning |
| `--er` | Error |
