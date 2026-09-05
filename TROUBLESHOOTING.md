# Troubleshooting

This guide covers common runtime issues when using SVG Processor.

## Missing Target Element ID

Symptoms:

- Insert Text or Insert Image fails because an element ID cannot be found.

Checks:

- Ensure the target SVG element has an `id` attribute.
- Ensure `Target Element ID` exactly matches the SVG `id` value.

## Wrong Target Element Type

Symptoms:

- Insert Text fails when targeting non-text elements.
- Insert Image fails when targeting unsupported container shapes.

Checks:

- Insert Text supports `text` and `tspan` only.
- Insert Image supports `rect`, `circle`, `ellipse`, `path`, `polygon`, `polyline`, `line`.

## Invalid Image Input for Insert Image

Symptoms:

- Error about missing or invalid MIME type.
- Error about expression resolving to an unexpected object.

Checks:

- Ensure image input resolves to a single n8n binary object (not the whole binary map).
- Ensure the binary object includes `mimeType`.
- Supported image MIME families are PNG, JPG/JPEG, and SVG.

## Template Binary Property Not Found

Symptoms:

- Conversion or insertion fails while reading the SVG template.

Checks:

- Confirm the input item includes the configured Template Binary Property name.
- Default property is `data`.

## SVG Parsing or Conversion Failures

Symptoms:

- Errors while parsing SVG or converting to PDF/JPG/PNG.

Checks:

- Validate SVG markup structure.
- Remove unsupported or malformed SVG fragments.
- Test with a minimal SVG to isolate template issues.

## Output Location and File Naming

Symptoms:

- Output appears in an unexpected binary field or filename.

Checks:

- Verify `Options -> Destination Output Field`.
- Verify `Options -> File Name` (extension is auto-managed by operation).

## Still Stuck?

Open an issue with:

- n8n version
- node version
- operation used
- sanitized sample SVG and input shape
- exact error message

Repository: https://github.com/officina-musci/n8n-nodes-svg-processor/issues
