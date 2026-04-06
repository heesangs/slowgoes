# Figma sync rules

- Always reuse components from `src/components/ui` first.
- Never hardcode colors, spacing, radius, or typography if a token exists.
- Prefer existing design tokens from `src/styles/tokens` or `src/tokens`.
- Match Figma visually, but translate output into this repo’s conventions.
- Do not add a new icon package if the asset already comes from Figma.
- For every Figma-driven implementation:
  1. get design context
  2. get screenshot
  3. implement with existing components
  4. compare visually and patch
