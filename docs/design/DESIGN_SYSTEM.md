# Veyra design system — Phase 02

> **Superseded where it differs by the root [DESIGN.md](../../DESIGN.md) (VIDEO-02).** Tokens below
> remain valid; VIDEO-02 adds `--stage`, `--stage-text`, `--teal-wash`, `--radius-media`, darkens
> `--border-strong` to `#7A8D84` (3.5:1), sets workspace page titles to 24px, replaces the
> Overview hero with an orientation header, and renames Search to **Explore**.

Veyra is a personal workspace for understanding video and taking the next useful action.
Its visual character combines calm technology, human-centered safety and friendly productivity.
The overview leads with a useful command, a small camera summary and a few recent moments.
It does not open with a wall of live feeds.

## Design direction

The memorable element is the invitation to ask for a moment or a feature, framed by a quiet
sage navigation rail. The video workspace uses open section headings rather than enclosing
every section in an identical card. Cards represent actual things: a camera, saved view,
video result or proposed action. Original vector space illustrations appear only in the
explicit preview workspace and are labeled “Illustration · no video.”

```text
┌────────────────┬───────────────────────────────────────────────────┐
│ Veyra          │ Workspace / Overview        Search / Ask Muse      │
│                ├───────────────────────────────────────────────────┤
│ Personal       │ [Preview disclosure, only when explicitly enabled] │
│ workspace      │                                                   │
│                │ Your spaces, a little clearer.                    │
│ Overview       │ [ Find a moment, or ask Muse…                  → ] │
│ Cameras        │ Camera summary                  Manage cameras    │
│ Live view      │                                                   │
│ Recordings     │ Everyday view             A few recent moments    │
│ Search         │ ┌─────────────────┐       Activity + evidence     │
│ Activity       │ │ One place       │       Privacy controls        │
│ Saved views    │ └─────────────────┘                               │
│                │ Saved views                                       │
│ Meet Muse      │ [Everyday spaces] [Outdoors] [Create a view]        │
│ Settings       │                                                   │
└────────────────┴───────────────────────────────────────────────────┘
```

Alignment stays left for reading and review. Empty states center a short explanation and a
concrete next action. Numbers support the workspace; they do not become a giant metrics hero.

## Tokens

Source: `apps/web/src/styles/tokens.css`. No external theme preset controls the identity.

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F7F9F6` | Workspace background |
| Surface | `#FFFFFF` | Cameras, controls, dialogs, action cards |
| Sage | `#DCECE5` | Selected structure and supporting surfaces |
| Primary teal | `#207A70` | Primary actions, focus, helpful links |
| Dark ink | `#253B36` | Headings and important information |
| Secondary text | `#5D6D64` | Refined from #64736D to preserve AA on tinted surfaces |
| Soft blue | `#E8F1F7` | Preview disclosure, contextual information |
| Warm amber | `#E6B56E` | Attention and approval, never alarm decoration |
| Amber text | `#78501D` on `#FCF2E3` | Consequential-action review |
| Border | `#E0E7E0` | Nonessential section and object boundaries |
| Input border | `#879A90` | Form field boundary |

Primary teal on white measures 5.15:1; ink on canvas 11.29:1. Secondary text was darkened
after browser contrast checks found failures on the sidebar, library selection and privacy
callout. Use the verification report for the executed checks. Color never carries status
alone: connection states have text; indexing includes a labeled progressbar; errors explain
what failed.

## Typography and spacing

- Self-hosted **Manrope Variable**, with Avenir Next/Segoe UI fallback. No font CDN requests.
- Page titles: 25–39px, weight 650, restrained negative tracking. Section titles: 15–18px.
- Product controls/body: typically 12–14px; supporting metadata 10–12px. Essential task
  instructions remain text, never icon-only. Video positions use tabular interpretation
  with an explicit `mm:ss` label and millisecond wire values.
- Base rhythm: 4px. Component spacing usually 8/12/16/24px; page gutter 38px desktop,
  28px tablet, 18px mobile. Paragraphs target less than 75 characters per line.
- Radii have distinct jobs: controls 8px, object surfaces 12–14px, dialogs 20px.
- Shadows are reserved for floating dialogs and the universal command entry. No decorative
  gradients, pulsing AI orb or urgent status glow.

## Responsive structure

| Width | Navigation / content behavior |
| --- | --- |
| >1190px | 224px labeled sidebar, open overview columns, three camera cards |
| 981–1190px | 194px sidebar, two camera cards, reduced gutters |
| 541–980px | 76px icon rail; every destination retains an accessible name and title |
| ≤540px | Navigation dialog, compact header, single-column objects and stacked live tiles |

The live 2×2 selection keeps four camera tiles but stacks them on small screens for readable
content. A recording library moves below the player on tablet. Search filters wrap, never
overflow. The Muse side panel becomes almost full-width on phones.

## Component states and accessibility

Buttons have default/hover/focus/disabled states; primary actions use white on teal.
Keyboard focus is a 3px teal ring with 4px offset. The skip link targets the main region.
Dialogs use Radix focus trapping, input focus on open, Escape and focus restoration.
The command palette supports Ctrl/Cmd+K, arrow keys, Enter, Tab and Escape. Icon buttons
have accessible names. Reduced-motion preferences and the local setting disable animations.

Disabled actions remain explained. Loading does not display invented footage. A missing
service uses a recoverable state, not a fake empty library. Empty search never implies an
event did not occur. Native controls are exposed only for an actual validated media session.

## Fixture policy

Default mode reads the real service through a constrained server-only frontend adapter.
`?preview=1` explicitly enables authored fixtures. A persistent blue banner, per-item labels
and page notes distinguish them from actual observations. Vector illustrations are not
video evidence. “Connected” in this mode is a sample camera state. Search fixtures identify
`fixture-only` provenance; local layout creation states that the server did not change.

`?preview=1&state=loading|empty|error|indexing` exercises representative states; the Settings
preview control changes that URL. Exiting preview removes the fixture and state parameters.
No provider key, camera URL or raw internal storage path is a browser setting.
