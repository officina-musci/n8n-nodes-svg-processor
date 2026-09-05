# n8n-nodes-svg-processor

[![npm version](https://img.shields.io/npm/v/%40officina-musci%2Fn8n-nodes-svg-processor)](https://www.npmjs.com/package/@officina-musci/n8n-nodes-svg-processor)
[![CI](https://github.com/officina-musci/n8n-nodes-svg-processor/actions/workflows/ci.yml/badge.svg)](https://github.com/officina-musci/n8n-nodes-svg-processor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

SVG Processor is an n8n community node for editing SVG templates and converting SVG files to PDF, JPG, or PNG directly inside workflows.

## Installation

This package is currently documented for **self-hosted n8n**.

Use the Community Nodes install flow in n8n:

https://docs.n8n.io/integrations/community-nodes/installation/

Package name:

```text
@officina-musci/n8n-nodes-svg-processor
```

If you install manually in a custom environment:

```bash
npm install @officina-musci/n8n-nodes-svg-processor
```

## Requirements and Compatibility

- n8n instance with Community Nodes enabled.
- Built with n8n Node API v1.
- No credentials required.
- For local development/build of this package: Node.js `^22.21.0 || >=24.0.0`.
- Cloud compatibility status is not declared in this repository; use self-hosted n8n unless you have explicit approval/validation for your environment.

## Operations

### Insert Text

Replace text in one or more target SVG elements by ID.

- Target element must be `text` or `tspan`.
- Multiple target rows are supported in one execution.
- Long text on `text` elements is wrapped when container width can be inferred.

### Insert Image

Insert one or more images into target SVG shape containers by ID.

- Supported source image formats: PNG, JPG, SVG.
- Supported target container shapes: `rect`, `circle`, `ellipse`, `path`, `polygon`, `polyline`, `line`.
- Resize modes: `none`, `contain`, `cover`.
- Overflow handling supports clipping inserted images to target bounds.

### Convert String to SVG

Validate an SVG markup string and output it as SVG binary.

### Convert SVG to PDF

Convert SVG binary input to PDF binary output.

### Convert SVG to JPG

Convert SVG binary input to JPG binary output.

### Convert SVG to PNG

Convert SVG binary input to PNG binary output.

## Parameters (Summary)

Common parameters:

- Resource and Operation.
- Template Binary Property (default: `data`, not used for Convert String to SVG).
- Options:
  - Destination Output Field (default: `data`).
  - File Name (base name, extension added automatically).

Insert Text rows:

- Target Element ID.
- Content.

Insert Image rows:

- Target Element ID.
- Insert Image Content (binary object/property).
- Resize Mode.
- Preserve Aspect Ratio.
- Overflow Handling.

## Input and Output

Insert Text and Insert Image:

- Input: SVG template binary.
- Output: modified SVG binary.

Convert String to SVG:

- Input: SVG string.
- Output: SVG binary.

Convert SVG to PDF/JPG/PNG:

- Input: SVG template binary.
- Output: converted binary file.

## Quick Usage Notes

- Keep SVG template data in a binary property (usually `data`) from an upstream node.
- For multi-target edits, add multiple rows in the target collection.
- Processing is fail-fast per item: an invalid target row raises an error for that item.

## Troubleshooting

For common issues and fixes (missing IDs, invalid element types, binary content shape, unsupported MIME types), see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Contributing and Releasing

- Contributor setup and local development: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Release/versioning workflow: [RELEASING.md](./RELEASING.md)

`CHANGELOG.md` is managed by release automation. Do not edit it manually.

## Resources

- n8n community nodes: https://docs.n8n.io/integrations/#community-nodes
- n8n node creation overview: https://docs.n8n.io/integrations/creating-nodes/overview/

## License

MIT. See [LICENSE](./LICENSE).
