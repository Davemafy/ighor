# Igor editorial motion system

The landing page and product now share cobalt (#2948a1), vermilion (#c8312e), warm paper (#f3f0e3), original Igor artwork, and a condensed display face. This adopts the supplied Daddy Yankee recording's editorial scale, framed imagery and chapter rhythm while retaining Igor's own content and usable product controls.

## Actual technology

- Next.js remains the application platform. Webflow is not required to implement the reference's visual language.
- GSAP 3.15.0 powers landing headline/photograph entrances, section reveals and photo parallax through ScrollTrigger. It also animates newly rendered product cards and documents, with scoped context cleanup.
- Lenis 1.3.27 smooths only the desktop marketing document on fine-pointer devices. Nested interactive examples, dialogs and rails are excluded. Mobile and reduced-motion users keep native scrolling. The product's message panes also retain native scrolling.
- Anton, distributed through Fontsource under its bundled font license, supplies the tall display typography. Archivo remains the primary brand/interface face. The commercial ABC Diatype Compressed and Ayer font files from the reference are not bundled.
- The optional studio score is composed in code using Web Audio sine tones and original four-note chord voicings. It downloads no audio and does not request a microphone. It starts only on a direct button click, stops when the document is hidden or left, and never resumes automatically. Controls appear on the landing and beside Appearance in the product.

`node scripts/sync-brand-assets.mjs` copies pinned package distributions, font and license metadata into `public/marketing/vendor/` and compiles the shared sound module. Both predev and prebuild run this step. The landing therefore makes no CDN requests for these libraries. Preserve the upstream license notices in the generated files; GSAP uses its own standard license rather than an MIT license.

## Interaction rules

Content remains visible if animation scripts fail. GSAP changes transforms/opacity, not document structure or tool execution. Reduced motion and the product's Gentle motion setting disable product entrances. Every pending message retains the three branded postcards. Source evidence, available images, saved selections and editing behavior remain owned by the existing application.

The visual pass does not claim to resolve provider failures, produce missing photography, or verify research results. Those remain engine/data responsibilities.
