# Changelog

## 0.2.0 (2026-08-08)

## 0.1.0

- Refined Target Elements row labeling in Insert Text and Insert Image to use "Element" for clearer parameter grouping.
- Streamlined Insert Image parameter layout so Overflow Handling is presented once, after Preserve Aspect Ratio, and remains available for all resize modes.
- Applied Overflow Handling consistently across image resize modes so `hide` clips inserted images in `contain`, `none`, and `cover` layouts.
- Initial public release of the SVG Processor n8n community node.
- Added SVG processing actions for:
  - Insert Text: replace text content on target `text`/`tspan` elements.
  - Insert Image: insert PNG/JPG/SVG content into supported SVG shape containers.
  - Conversion: convert SVG to PDF, JPG, and PNG.
  - Convert String to SVG: validate SVG markup and output SVG binary.
- Added Insert Text enhancements including multiline handling and automatic wrapping when container width can be inferred.
- Added Insert Image behavior controls for resize mode, aspect-ratio preservation, and overflow clipping where applicable.
- Added binary-source flexibility for image insertion (property-name source and direct n8n binary object expressions, including filesystem-backed binary descriptors).
- Added output controls for destination binary field and output filename fallback behavior.
- Added CI and release workflows for lint/build validation and npm release automation with provenance support.
- Added project metadata and documentation aligned with SVG file and template processing workflows.
