# Igor visual system

The product's starting point is a user's goal or confirmed taste. It should never require the user to pick a separate micro-tool.

## Reference study

The supplied Rainbow webpage archive and desktop recording show these useful patterns:

- Oversized rounded display type carries the main message. Product screens, not marketing cards, carry the proof.
- Simple, bright section backgrounds support a small number of focused controls.
- High-contrast buttons have generous hit areas and a recognizable silhouette.
- A small set of floating, tactile objects conveys movement and character. They do not compete with primary controls.
- Motion is restrained around navigation, hover states and demonstrations.

The archive includes Rainbow's own assets and licensed fonts. None are imported into Igor. Igor uses original CSS shapes, system font fallbacks and Qloo-provided image URLs where available.

## Igor tokens

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#11111e` | Text, outlines and primary actions |
| Canvas | `#f9f8f2` | Quiet interface background |
| Sky | `#b5f5f8` | Starting point and refinement |
| Lilac | `#e6dcff` | Active cultural result |
| Peach | `#ffa681` | Group experience |
| Lime | `#daffa0` | Personal taste |
| Accent | `#f36e5b` | One expressive word or detail |

## UI contracts

- The first viewport must offer a text goal and at least one tap-to-start example.
- The same composition should lead to a real result without switching visual languages.
- All result names, descriptions, IDs and images come from the active task. Fallback artwork is decorative, not fake cultural content.
- Show Qloo delivery as LIVE or CACHED based on returned signal records. Do not label a page LIVE just because the app is configured for live mode.
- An association is not proof of personal preference, venue availability, cost or travel time.
- Ambiguous identities require a choice; failed retrieval requires a truthful empty state.
- All interactive controls need keyboard focus and a minimum comfortable tap area.
- Honor reduced-motion settings. Never use required animations for essential information.

## Routes

- `/`: discovery, results, related cultural threads, refinements and saved-workspace access.
- `/workspace`: advanced planning, evidence, collections, editing and export.

The legacy workspace remains accessible while its advanced views are redesigned. Both routes use the same server-owned tasks, permissions, Qloo provider and model adapter.