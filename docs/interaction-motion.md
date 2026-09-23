# Shared press feedback

Scope follows the final request: **press interactions only**. Close/cross buttons
are excluded. Window, dialog, drawer, menu and popover presence is unchanged.

`src/styles/motion.css` owns the tokens; the existing `--ofi-btn-press-*` names
remain aliases. `src/lib/uiMotion.ts` reads these values (durations in milliseconds).
`src/lib/buttonFeedback.ts` extends the existing delegated Web Animations layer,
installed once in `main.tsx` before the first interaction. No dependency was added.

- Press: 85ms, scale at least 0.98, maximum compression 1.5px across the longest
  edge. Wide rows/cards compress less. A small brightness response preserves the
  original filter and surface color.
- Release: 240ms with a restrained overshoot curve. Existing positioning transforms,
  component dimensions, color transitions and focus styles remain intact.
- Coverage: buttons, links, tabs, menu items/options, switches, checkbox/radio controls,
  summaries, and legacy clickable cards/rows with both a click handler and pointer
  cursor. Delegation also covers portals and controls mounted later.
- Ant Design checkbox/radio feedback targets the visible control, including presses
  on its associated label, instead of scaling the transparent input or label text.
- Text inputs, editable areas, disabled/inert ancestors, drag/resize handles and
  close controls are excluded. Pointer cancellation, movement beyond 7px, scroll,
  window blur, visibility changes and live reduced-motion changes clear feedback.
- Keyboard Enter/Space gets equivalent feedback without intercepting the action.
  `prefers-reduced-motion: reduce` disables press scaling and spring animations.

For a custom action without native/ARIA semantics, prefer adding the correct
button/link role and keyboard behavior. `data-motion-press` explicitly opts in;
`data-motion="off"` opts out an entire subtree. `data-motion-dismiss` marks an
otherwise unrecognizable close control. The local X icon supplies that marker.

Old competing active scales (0.88–0.992) were removed from buttons, refine, login,
order details, purchase import, quick add/entry and update-window styles. Duplicate
pressed translations in Button/PlainUi/MontageHome and large hover scales on action
icons/color swatches were removed. Decorative drag previews and existing surface
animations are unaffected.

## Apple references

Reviewed: [Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass),
[NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview),
[effectIsInteractive](https://developer.apple.com/documentation/appkit/nsglasseffectview/effectisinteractive),
[SwiftUI Glass](https://developer.apple.com/documentation/swiftui/glass),
[interactive](https://developer.apple.com/documentation/swiftui/glass/interactive(_:)),
[NSWindow animationBehavior](https://developer.apple.com/documentation/appkit/nswindow/animationbehavior-swift.property).
Apple describes responsive interactive materials and automatic, type-dependent
window animation; those pages do not specify web easing curves or exact durations.
The tokens above are a restrained web interpretation, not a native material replica.

## Verification

Run `npm.cmd run build`, then `node scratchpad/motion-smoke.mjs` on Windows with
Chrome installed at its default location. The smoke checks run against compiled
application styles and current interaction source in a local browser fixture with
no API requests. They cover semantic controls, portals, legacy rows, exclusions,
cancellation, keyboard, inherited disabled state, native mouse events, preserved
layout/transforms and live reduced motion. Use `npx.cmd eslint` on changed TypeScript
files; the repository-wide lint command currently reports unrelated existing errors.
