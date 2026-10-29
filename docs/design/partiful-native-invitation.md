# Igor's visual contract — poster first, software second

**Design authority:** Partiful's publicly documented event creation and invitation
flows, adapted to Igor's existing type, navigation, and agent architecture. This is
a product design standard, **not** a claim to use Partiful's proprietary tokens or
assets.

## What the reference actually demonstrates

Public Partiful documentation describes these controls and their order:

1. Name the event and select title typography.
2. Choose a poster, including uploaded imagery or GIFs.
3. Supply the event's actual date, place and description.
4. Customize *Theme* (background) and *Effect* (animation) separately.
5. Save a draft before inviting people; invitation/RSVP is a distinct step.

The editorial principle is **one expressive thing surrounded by quiet controls**.
The example event creator lets the poster/background carry almost all of the
personality. The editing toolbar never pretends to be a scientific instrument.

References:
- https://help.partiful.com/en-us/articles/15525299-creating-your-first-partiful-event
- https://partiful.com/create
- https://help.partiful.com/en-us/articles/15525324-how-do-i-invite-guests-to-my-event
- https://help.partiful.com/en-us/articles/15525571-how-can-i-get-featured-on-the-partiful-explore-page

## Igor's implementation rules

**Keep existing product DNA.** All controls inherit Igor's existing Archivo type
and neutral workspace; use the same navigation, focus states, responsive pane
model, and established artifact API. Do not ship a new application shell for
one result type.

**Use a poster as the expressive surface.** The invitation is an authored,
editable output. Give it room. It may have playful typography, colorways and
clearly attributable cultural cover references. Its editing controls should be
understandable instantly. Do not add fake crosshairs, fake measurements, glowing
nodes or “AI instrument” labels.

**Separate the result from its source.** Qloo is a *cultural association*
provider. On an invite poster, Qloo imagery is presented as cultural reference
art, not a photograph of the event or its venue. Source delivery can be marked
LIVE/CACHED only where a current evidence ID matches the candidate. There are
no invented ranks, percentages, approvals or bookings.

**Preserve real uncertainty.** Neither a Qloo recommendation nor a planning
default is a confirmed booking, location or calendar date. Unset details are
marked as such; examples are explicitly sample profiles, not real invitees.
Nothing is sent by Igor.

**Don't stage interaction.** Title and message edits must affect the preview
immediately and be persisted using Igor's existing artifact turn. Copy works
only on real text. A missing invitation can trigger a real user-visible
request to Igor to draft one, but must not pretend an invitation exists.

**Do not clone Partiful assets.** Style names and values in
`src/app/invitation-studio.css` are Igor-authored, noncanonical design choices.
The reference justifies the visual hierarchy and editing affordances, not
copying an official font file, poster, animation, trademark or proprietary token.

## QA contract

- In a recorded Qloo gathering, the invitation is reached within the current
  /app conversation and maintains Igor's outer UI.
- Artifacts that are missing/stale/locked have honest states and save behavior.
- A title/body edit roundtrips through the server; visual theme selection
  stays local to this browser (explicitly disclosed).
- At 390px and 1600px the poster and controls remain readable and operable.
- Tests cover data projection, source integrity, cross-origin image guards,
  stale state, output limits, editing and screen captures.
- Full repo gates must pass before merge. The screenshot itself is a review
  artifact, not evidence of live Qloo or actual guest communication.

## What comes next

This design system should scale into discovery, collaborative planning and
research **without** painting everything like a birthday invitation. The
rule is expressive *outputs* and disciplined *tools*. For a map the expressive
object may be the map; for a document the expressive object is the document;
for a gathering it is the invite and its cultural references. Each should feel
native to the same Igor product.
