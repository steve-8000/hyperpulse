# Apple-style Light/Dark Redesign Plan

## Scope
- Redesign visual language only for existing frontend pages.
- Preserve all React component structure, routes, and behavior.
- Keep theme switching mechanism as-is (`data-theme` in `App.jsx`).

## Implementation
1. Update `frontend/src/app.css` design tokens for light and dark themes.
2. Refine surfaces, borders, shadows, typography rhythm, and spacing consistency.
3. Restyle key shared UI primitives (cards, panels, nav, buttons, tables, pills/badges) for Apple-like clarity and depth.
4. Ensure responsive behavior remains intact for desktop/mobile breakpoints.

## Verification
1. Run LSP diagnostics on changed files.
2. Run `npm run build` and confirm exit code 0.
3. Perform visual sanity checks for both light and dark mode in key layout shells.

## Constraints
- No backend changes.
- No new features.
- No route/state logic changes.
