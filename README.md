# n8n-nodes-svg-processor

SVG Processor is an n8n community node that lets you process SVG files and templates and export them to different formats directly inside workflows.

The node accepts SVG templates as binary input and supports:

- Replacing text in SVG text elements.
- Inserting raster/vector images into SVG shape containers.
- Exporting SVG to PDF, JPG, or PNG.

## Installation

Follow the n8n community node installation guide:

https://docs.n8n.io/integrations/community-nodes/installation/

## Releases

This repository uses Conventional Commits to drive versioning and changelog generation.

- Use commit messages like `feat: add image resize mode` or `fix: handle missing SVG viewbox`.
- Breaking changes should include `BREAKING CHANGE:` in the commit body or footer.
- Merge commits are allowed, but the merged commits still need to follow Conventional Commits.
- `CHANGELOG.md` is generated automatically by the release workflow. Do not edit it manually.

When commits land on `main`, the CI workflow runs tests and linting. If successful, the `release` workflow automatically bumps the version (using Conventional Commits), creates a Git tag, and publishes the package to npm.

If you need to cut a release locally, run `npm run release`. It will create the
release commit and tag, but it will not publish to npm directly.

## Operations

### Insert Text

Replaces text in one or more target SVG elements by ID.

- Target element must be `<text>` or `<tspan>`.
- Multiple insertions are supported in one execution using the Target Elements list.
- Long lines on `<text>` targets are wrapped when a text container width can be inferred (for example via shape-inside).

### Insert Image

Inserts one or more images into target SVG shape containers by ID.

- Supported image formats: PNG, JPG, SVG.
- Supported target container shapes: `rect`, `circle`, `ellipse`, `path`, `polygon`, `polyline`, `line`.
- Resize modes: `none`, `contain`, `cover`.
- Optional controls: Preserve Aspect Ratio and Overflow Handling.

### Convert to PDF

Converts SVG template binary input to PDF binary output.

### Convert to JPG

Converts SVG template binary input to JPG binary output.

### Convert to PNG

Converts SVG template binary input to PNG binary output.

## Parameters

### Common Parameters

- Template Binary Property: binary property that contains the input SVG template (default: `data`).
- Output Binary Property: output binary property name (default: `data`).
- Output File Name: output base filename (extension is added automatically).

### Insert Text Target Row

- Element
- Target Element ID
- Content

### Insert Image Target Row

- Element
- Target Element ID
- Content (image binary property)
- Resize Mode (default: `contain`)
- Preserve Aspect Ratio (default: `true`, shown only when Resize Mode is `cover`; `contain` always preserves ratio)
- Overflow Handling (default: `hide`, shown after Preserve Aspect Ratio and available for all resize modes)

Notes:

- In `contain` and `cover` modes, the node always applies resizing behavior needed for those modes, including upscaling smaller images.
- Overflow Handling applies to all resize modes and clips the inserted image to the target shape bounds when set to `hide`, including in `contain` mode.

## Input and Output

- Insert Text / Insert Image
  - Input: SVG binary template
  - Output: modified SVG binary

- Convert to PDF / JPG / PNG
  - Input: SVG binary template
  - Output: converted binary file

## Error Handling

The node raises descriptive errors for:

- Missing target element ID in SVG
- Incompatible target element type for the selected operation
- Unsupported image format for insertion
- Invalid SVG template structure
- Conversion failures

## Credentials

No credentials are required.

## Compatibility

- Built with n8n Node API v1.
- Designed for modern n8n versions that support community nodes and binary data workflows.

## Usage Notes

- Keep your SVG template in a binary property (typically `data`) from an upstream node.
- For multiple insertions, add multiple Target Elements rows.
- For fail-fast behavior, the node stops processing the current item on the first invalid insertion row.

## Resources

- n8n community nodes docs: https://docs.n8n.io/integrations/#community-nodes
- n8n node creation docs: https://docs.n8n.io/integrations/creating-nodes/overview/

## Version History

See CHANGELOG.md for release notes.
