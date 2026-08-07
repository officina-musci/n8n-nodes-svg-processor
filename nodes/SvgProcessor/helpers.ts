import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Document as XmlDocument, Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom';
import { Resvg } from '@resvg/resvg-js';
import { imageSize } from 'image-size';
import jpeg from 'jpeg-js';
import PDFDocument from 'pdfkit';
import { PNG } from 'pngjs';
import { svgPathBbox } from 'svg-path-bbox';
import SVGtoPDF from 'svg-to-pdfkit';

import type {
	BBox,
	ImageInsertionRow,
	ImageResizeMode,
	OverflowHandling,
	ProcessedImage,
	TextInsertionRow,
} from './types';

const XML_MIME_TYPE = 'image/svg+xml';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', XML_MIME_TYPE]);
const CONTAINER_TAGS = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);

export function parseSvgDocument(svgSource: string) {
	const parser = new DOMParser({ errorHandler: () => undefined });
	const document = parser.parseFromString(svgSource, XML_MIME_TYPE);
	const root = document.documentElement;

	if (!root || root.tagName.toLowerCase() !== 'svg') {
		throw new Error('Template is not a valid SVG document');
	}

	const parserErrors = document.getElementsByTagName('parsererror');
	if (parserErrors.length > 0) {
		throw new Error('Template contains invalid SVG markup');
	}

	return document;
}

export function serializeSvgDocument(document: XmlNode): string {
	return new XMLSerializer().serializeToString(document);
}

export function appendTextToTarget(document: XmlDocument, insertion: TextInsertionRow): void {
	const target = findElementById(document, insertion.targetElementId);
	if (!target) {
		throw new Error(`Target element with id "${insertion.targetElementId}" was not found`);
	}

	const tagName = target.tagName.toLowerCase();
	if (tagName !== 'text' && tagName !== 'tspan') {
		throw new Error(
			`Target element "${insertion.targetElementId}" is type "${tagName}"; expected "text" or "tspan" for text insertion`,
		);
	}

	clearElementChildren(target);

	const shapeInsideRect = resolveShapeInsideRectBox(document, target);
	const lines = resolveWrappedTextLines(target, insertion.content, shapeInsideRect?.width);

	if (shapeInsideRect) {
		appendMultilineTextWithAbsolutePositioning(document, target, lines, shapeInsideRect);
		return;
	}

	if (lines.length <= 1) {
		target.appendChild(document.createTextNode(lines[0] ?? ''));
		return;
	}

	const lineX = resolveTextLineX(target);
	const lineDy = '1em';

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const tspan = document.createElement('tspan');

		if (index > 0) {
			tspan.setAttribute('dy', lineDy);
			if (lineX) {
				tspan.setAttribute('x', lineX);
			}
		}

		tspan.appendChild(document.createTextNode(line));
		target.appendChild(tspan);
	}
}

export function buildProcessedImage(buffer: Buffer, mimeType: string): ProcessedImage {
	if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
		throw new Error('Unsupported image format. Supported formats are PNG, JPG, and SVG');
	}

	const format = mimeType === XML_MIME_TYPE ? 'svg' : mimeType.includes('png') ? 'png' : 'jpg';
	const dimensions = getImageDimensions(buffer, format);

	return {
		buffer,
		mimeType,
		format,
		width: dimensions.width,
		height: dimensions.height,
	};
}

export function insertImageIntoTarget(
	document: XmlDocument,
	insertion: ImageInsertionRow,
	processedImage: ProcessedImage,
	clipIdSeed: string,
): void {
	const target = findElementById(document, insertion.targetElementId);
	if (!target) {
		throw new Error(`Target element with id "${insertion.targetElementId}" was not found`);
	}

	const tagName = target.tagName.toLowerCase();
	if (!CONTAINER_TAGS.has(tagName)) {
		throw new Error(
			`Target element "${insertion.targetElementId}" is type "${tagName}"; expected one of these shape container types: ${Array.from(
				CONTAINER_TAGS,
			).join(', ')}`,
		);
	}

	const targetBox = getShapeBoundingBox(target);
	const placement = calculateImagePlacement(targetBox, processedImage, insertion);

	const imageElement = document.createElement('image');
	imageElement.setAttribute('x', numberToSvg(placement.x));
	imageElement.setAttribute('y', numberToSvg(placement.y));
	imageElement.setAttribute('width', numberToSvg(placement.width));
	imageElement.setAttribute('height', numberToSvg(placement.height));
	imageElement.setAttribute(
		'preserveAspectRatio',
		resolvePreserveAspectRatio(insertion.resizeMode, insertion.preserveAspectRatio),
	);
	const imageDataUri = toDataUri(processedImage.buffer, processedImage.mimeType);
	imageElement.setAttributeNS(null, 'href', imageDataUri);
	imageElement.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', imageDataUri);

	if (insertion.overflowHandling === 'hide') {
		const clipId = `${clipIdSeed}-clip`;
		attachClipPath(document, target, clipId);
		imageElement.setAttribute('clip-path', `url(#${clipId})`);
	}

	const parent = target.parentNode;
	if (!parent) {
		throw new Error(`Target element "${insertion.targetElementId}" cannot receive inserted content`);
	}

	if (target.nextSibling) {
		parent.insertBefore(imageElement, target.nextSibling);
	} else {
		parent.appendChild(imageElement);
	}
}

export function convertSvgToPng(svgSource: string): Buffer {
	const resvg = new Resvg(svgSource, {
		fitTo: { mode: 'original' },
	});

	return Buffer.from(resvg.render().asPng());
}

export function convertSvgToJpg(svgSource: string): Buffer {
	const pngBuffer = convertSvgToPng(svgSource);
	const png = PNG.sync.read(pngBuffer);
	const rgbWithOpaqueAlpha = flattenAlphaAgainstWhite(png.data);

	return Buffer.from(
		jpeg.encode(
			{
				data: rgbWithOpaqueAlpha,
				width: png.width,
				height: png.height,
			},
			90,
		).data,
	);
}

export async function convertSvgToPdf(svgSource: string): Promise<Buffer> {
	const dimensions = getSvgCanvasDimensions(svgSource);

	return await new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		const document = new PDFDocument({
			size: [dimensions.width, dimensions.height],
			margin: 0,
		});

		document.on('data', (chunk: Buffer) => chunks.push(chunk));
		document.on('error', reject);
		document.on('end', () => resolve(Buffer.concat(chunks)));

		try {
			SVGtoPDF(document, svgSource, 0, 0, {
				preserveAspectRatio: 'xMidYMid meet',
			});
			document.end();
		} catch (error) {
			reject(error);
		}
	});
}

export function ensureTextInsertions(value: unknown): TextInsertionRow[] {
	const rows = extractRows(value);
	return rows.map((row, index) => {
		const targetElementId = readString(row.targetElementId, `Target Element ID in row ${index + 1}`);
		const content = readString(row.content, `Content in row ${index + 1}`);
		return { targetElementId, content };
	});
}

export function ensureImageInsertions(value: unknown): ImageInsertionRow[] {
	const rows = extractRows(value);
	return rows.map((row, index) => {
		const targetElementId = readString(row.targetElementId, `Target Element ID in row ${index + 1}`);
		const imageBinaryPropertyName = readBinarySource(
			row.imageBinaryPropertyName,
			`Content in row ${index + 1}`,
		);
		const resizeMode = readEnum<ImageResizeMode>(row.resizeMode, ['none', 'contain', 'cover'], 'Resize Mode');
		const preserveAspectRatio =
			resizeMode === 'contain' ? true : toBoolean(row.preserveAspectRatio, true);
		const forceResizeIfSmaller =
			resizeMode === 'cover' || resizeMode === 'contain' ? true : toBoolean(row.forceResizeIfSmaller, false);
		const overflowHandling = readOverflowHandling(row.overflowHandling);

		return {
			targetElementId,
			imageBinaryPropertyName,
			resizeMode,
			preserveAspectRatio,
			forceResizeIfSmaller,
			overflowHandling,
		};
	});
}

export function extensionForMimeType(mimeType: string): 'svg' | 'png' | 'jpg' | 'pdf' {
	switch (mimeType) {
		case 'image/png':
			return 'png';
		case 'image/jpeg':
			return 'jpg';
		case 'application/pdf':
			return 'pdf';
		case XML_MIME_TYPE:
		default:
			return 'svg';
	}
}

function readOverflowHandling(value: unknown): OverflowHandling {
	if (value === undefined || value === null || value === '') {
		return 'hide';
	}

	return readEnum<OverflowHandling>(value, ['show', 'hide'], 'Overflow Handling');
}

function extractRows(value: unknown): Array<Record<string, unknown>> {
	if (!value || typeof value !== 'object') {
		return [];
	}

	const collection = value as { values?: Array<Record<string, unknown>> };
	if (!Array.isArray(collection.values)) {
		return [];
	}

	return collection.values;
}

function findElementById(document: XmlDocument, targetId: string): XmlElement | null {
	const root = document.documentElement;
	if (!root) {
		return null;
	}

	const stack: XmlElement[] = [root];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		if (current.getAttribute('id') === targetId) {
			return current;
		}

		for (let index = current.childNodes.length - 1; index >= 0; index--) {
			const child = current.childNodes.item(index);
			if (child?.nodeType === 1) {
				stack.push(child as XmlElement);
			}
		}
	}

	return null;
}

function getShapeBoundingBox(target: XmlElement): BBox {
	const tagName = target.tagName.toLowerCase();

	switch (tagName) {
		case 'rect': {
			const x = parseSvgLength(target.getAttribute('x'), 0);
			const y = parseSvgLength(target.getAttribute('y'), 0);
			const width = parseSvgLength(target.getAttribute('width'), NaN);
			const height = parseSvgLength(target.getAttribute('height'), NaN);
			return ensureValidBox({ x, y, width, height }, 'rect');
		}
		case 'circle': {
			const cx = parseSvgLength(target.getAttribute('cx'), NaN);
			const cy = parseSvgLength(target.getAttribute('cy'), NaN);
			const radius = parseSvgLength(target.getAttribute('r'), NaN);
			return ensureValidBox({ x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }, 'circle');
		}
		case 'ellipse': {
			const cx = parseSvgLength(target.getAttribute('cx'), NaN);
			const cy = parseSvgLength(target.getAttribute('cy'), NaN);
			const rx = parseSvgLength(target.getAttribute('rx'), NaN);
			const ry = parseSvgLength(target.getAttribute('ry'), NaN);
			return ensureValidBox({ x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }, 'ellipse');
		}
		case 'line': {
			const x1 = parseSvgLength(target.getAttribute('x1'), NaN);
			const y1 = parseSvgLength(target.getAttribute('y1'), NaN);
			const x2 = parseSvgLength(target.getAttribute('x2'), NaN);
			const y2 = parseSvgLength(target.getAttribute('y2'), NaN);
			const x = Math.min(x1, x2);
			const y = Math.min(y1, y2);
			const width = Math.abs(x2 - x1);
			const height = Math.abs(y2 - y1);
			return ensureValidBox({ x, y, width: width || 1, height: height || 1 }, 'line');
		}
		case 'polygon':
		case 'polyline': {
			const points = parsePoints(target.getAttribute('points'));
			if (points.length === 0) {
				throw new Error(`Target element type "${tagName}" must define at least one point`);
			}

			const xs = points.map((point) => point.x);
			const ys = points.map((point) => point.y);
			const x = Math.min(...xs);
			const y = Math.min(...ys);
			const width = Math.max(...xs) - x;
			const height = Math.max(...ys) - y;
			return ensureValidBox({ x, y, width: width || 1, height: height || 1 }, tagName);
		}
		case 'path': {
			const d = target.getAttribute('d');
			if (!d) {
				throw new Error('Target element type "path" must define a valid d attribute');
			}
			const [minX, minY, maxX, maxY] = svgPathBbox(d);
			return ensureValidBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, 'path');
		}
		default:
			throw new Error(`Target element type "${tagName}" is not supported for image insertion`);
	}
}

function calculateImagePlacement(container: BBox, image: ProcessedImage, insertion: ImageInsertionRow): BBox {
	if (insertion.resizeMode === 'none') {
		return {
			x: container.x,
			y: container.y,
			width: image.width,
			height: image.height,
		};
	}

	if (!insertion.preserveAspectRatio) {
		if (insertion.resizeMode === 'cover' && !insertion.forceResizeIfSmaller) {
			if (image.width <= container.width && image.height <= container.height) {
				return {
					x: container.x + (container.width - image.width) / 2,
					y: container.y + (container.height - image.height) / 2,
					width: image.width,
					height: image.height,
				};
			}
		}

		const width = insertion.forceResizeIfSmaller || image.width > container.width ? container.width : image.width;
		const height =
			insertion.forceResizeIfSmaller || image.height > container.height ? container.height : image.height;
		return {
			x: container.x + (container.width - width) / 2,
			y: container.y + (container.height - height) / 2,
			width,
			height,
		};
	}

	const scaleX = container.width / image.width;
	const scaleY = container.height / image.height;
	const initialScale = insertion.resizeMode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
	const scale = !insertion.forceResizeIfSmaller && initialScale > 1 ? 1 : initialScale;

	const width = image.width * scale;
	const height = image.height * scale;

	return {
		x: container.x + (container.width - width) / 2,
		y: container.y + (container.height - height) / 2,
		width,
		height,
	};
}

function resolvePreserveAspectRatio(resizeMode: ImageResizeMode, preserveAspectRatio: boolean): string {
	if (!preserveAspectRatio || resizeMode === 'none') {
		return 'none';
	}

	return resizeMode === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
}

function attachClipPath(document: XmlDocument, target: XmlElement, clipId: string): void {
	const root = document.documentElement;
	if (!root) {
		throw new Error('SVG template is missing a root element');
	}

	let defs = root.getElementsByTagName('defs').item(0);

	if (!defs) {
		defs = document.createElement('defs');
		root.insertBefore(defs, root.firstChild);
	}

	const clipPath = document.createElement('clipPath');
	clipPath.setAttribute('id', clipId);
	clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');

	const clipShape = target.cloneNode(true) as XmlElement;
	clipShape.removeAttribute('id');
	clipPath.appendChild(clipShape);
	defs.appendChild(clipPath);
}

function getImageDimensions(buffer: Buffer, format: 'png' | 'jpg' | 'svg'): { width: number; height: number } {
	if (format === 'svg') {
		return getSvgCanvasDimensions(buffer.toString('utf8'));
	}

	const dimensions = imageSize(buffer);
	if (!dimensions.width || !dimensions.height) {
		throw new Error('Unable to determine inserted image dimensions');
	}

	return {
		width: dimensions.width,
		height: dimensions.height,
	};
}

function getSvgCanvasDimensions(svgSource: string): { width: number; height: number } {
	const document = parseSvgDocument(svgSource);
	const root = document.documentElement;
	if (!root) {
		throw new Error('SVG template is missing a root element');
	}
	const width = parseSvgLength(root.getAttribute('width'), NaN);
	const height = parseSvgLength(root.getAttribute('height'), NaN);

	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		return { width, height };
	}

	const viewBox = root.getAttribute('viewBox');
	if (viewBox) {
		const parts = viewBox
			.trim()
			.split(/[\s,]+/)
			.map((part) => Number(part));
		if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
			return { width: parts[2], height: parts[3] };
		}
	}

	return { width: 1024, height: 1024 };
}

function parsePoints(rawPoints: string | null): Array<{ x: number; y: number }> {
	if (!rawPoints) {
		return [];
	}

	const pairs = rawPoints.trim().split(/\s+/);
	const points: Array<{ x: number; y: number }> = [];

	for (const pair of pairs) {
		const [xPart, yPart] = pair.split(',');
		const x = Number(xPart);
		const y = Number(yPart);
		if (Number.isFinite(x) && Number.isFinite(y)) {
			points.push({ x, y });
		}
	}

	return points;
}

function parseSvgLength(value: string | null, fallbackValue: number): number {
	if (!value) {
		return fallbackValue;
	}

	const numericValue = Number.parseFloat(value.replace(/[^\d.+\-eE]/g, ''));
	return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}

function ensureValidBox(box: BBox, elementName: string): BBox {
	if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
		throw new Error(`Target element type "${elementName}" is missing required numeric geometry attributes`);
	}

	if (box.width <= 0 || box.height <= 0) {
		throw new Error(`Target element type "${elementName}" has a non-positive drawing area`);
	}

	return box;
}

function readString(value: unknown, fieldLabel: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${fieldLabel} is required`);
	}
	return value;
}

function readBinarySource(value: unknown, fieldLabel: string): string | Record<string, unknown> {
	if (typeof value === 'string' && value.trim() !== '') {
		return value.trim();
	}

	if (value && typeof value === 'object') {
		return value as Record<string, unknown>;
	}

	throw new Error(`${fieldLabel} is required`);
}

function toBoolean(value: unknown, defaultValue: boolean): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	return defaultValue;
}

function readEnum<T extends string>(value: unknown, supported: T[], fieldLabel: string): T {
	if (typeof value !== 'string' || !supported.includes(value as T)) {
		throw new Error(`${fieldLabel} must be one of: ${supported.join(', ')}`);
	}

	return value as T;
}

function flattenAlphaAgainstWhite(rgba: Buffer): Buffer {
	const result = Buffer.from(rgba);
	for (let index = 0; index < result.length; index += 4) {
		const alpha = result[index + 3] / 255;
		result[index] = Math.round(result[index] * alpha + 255 * (1 - alpha));
		result[index + 1] = Math.round(result[index + 1] * alpha + 255 * (1 - alpha));
		result[index + 2] = Math.round(result[index + 2] * alpha + 255 * (1 - alpha));
		result[index + 3] = 255;
	}
	return result;
}

function toDataUri(buffer: Buffer, mimeType: string): string {
	return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function numberToSvg(value: number): string {
	return Number(value.toFixed(4)).toString();
}

function resolveTextLineX(target: XmlElement): string | undefined {
	const ownX = target.getAttribute('x');
	if (ownX && ownX.trim() !== '') {
		return ownX;
	}

	let parent: XmlNode | null = target.parentNode;
	while (parent && parent.nodeType === 1) {
		const parentElement = parent as XmlElement;
		const parentX = parentElement.getAttribute('x');
		if (parentX && parentX.trim() !== '') {
			return parentX;
		}
		parent = parent.parentNode;
	}

	return undefined;
}

function clearElementChildren(target: XmlElement): void {
	while (target.firstChild) {
		target.removeChild(target.firstChild);
	}
}

function resolveWrappedTextLines(target: XmlElement, content: string, maxWidth?: number): string[] {
	const inputLines = content.split(/\r\n|\n|\r/g);
	if (target.tagName.toLowerCase() !== 'text') {
		return inputLines;
	}

	if (!maxWidth || !Number.isFinite(maxWidth) || maxWidth <= 0) {
		return inputLines;
	}

	const fontSize = resolveFontSize(target);
	const approximateCharacterWidth = Math.max(1, fontSize * 0.6);
	const maxCharactersPerLine = Math.max(1, Math.floor(maxWidth / approximateCharacterWidth));

	return inputLines.flatMap((line) => wrapSingleLine(line, maxCharactersPerLine));
}

function wrapSingleLine(line: string, maxCharactersPerLine: number): string[] {
	if (line.trim() === '') {
		return [''];
	}

	const words = line.trim().split(/\s+/);
	const wrapped: string[] = [];
	let currentLine = '';

	for (const word of words) {
		if (currentLine === '') {
			currentLine = pushOrSplitWord(word, maxCharactersPerLine, wrapped);
			continue;
		}

		const nextLine = `${currentLine} ${word}`;
		if (nextLine.length <= maxCharactersPerLine) {
			currentLine = nextLine;
			continue;
		}

		wrapped.push(currentLine);
		currentLine = pushOrSplitWord(word, maxCharactersPerLine, wrapped);
	}

	if (currentLine !== '') {
		wrapped.push(currentLine);
	}

	return wrapped;
}

function pushOrSplitWord(word: string, maxCharactersPerLine: number, wrapped: string[]): string {
	if (word.length <= maxCharactersPerLine) {
		return word;
	}

	let start = 0;
	while (start + maxCharactersPerLine < word.length) {
		wrapped.push(word.slice(start, start + maxCharactersPerLine));
		start += maxCharactersPerLine;
	}

	return word.slice(start);
}

function appendMultilineTextWithAbsolutePositioning(
	document: XmlDocument,
	target: XmlElement,
	lines: string[],
	shapeRect: BBox,
): void {
	const fontSize = resolveFontSize(target);
	const lineHeight = resolveLineHeight(target, fontSize);
	const baselineY = shapeRect.y + fontSize * 0.88;

	for (let index = 0; index < lines.length; index++) {
		const tspan = document.createElement('tspan');
		tspan.setAttribute('x', numberToSvg(shapeRect.x));
		tspan.setAttribute('y', numberToSvg(baselineY + index * lineHeight));
		tspan.appendChild(document.createTextNode(lines[index]));
		target.appendChild(tspan);
	}
}

function resolveShapeInsideRectBox(document: XmlDocument, target: XmlElement): BBox | null {
	const shapeInsideValue = getAttributeOrStyleValue(target, 'shape-inside');
	if (!shapeInsideValue) {
		return null;
	}

	const match = /url\(#([^)]+)\)/.exec(shapeInsideValue);
	if (!match) {
		return null;
	}

	const rectId = match[1];
	const referenced = findElementById(document, rectId);
	if (!referenced || referenced.tagName.toLowerCase() !== 'rect') {
		return null;
	}

	const x = parseSvgLength(referenced.getAttribute('x'), NaN);
	const y = parseSvgLength(referenced.getAttribute('y'), NaN);
	const width = parseSvgLength(referenced.getAttribute('width'), NaN);
	const height = parseSvgLength(referenced.getAttribute('height'), NaN);

	return ensureValidBox({ x, y, width, height }, 'rect');
}

function getAttributeOrStyleValue(target: XmlElement, attributeName: string): string | null {
	const directValue = target.getAttribute(attributeName);
	if (directValue && directValue.trim() !== '') {
		return directValue;
	}

	const style = target.getAttribute('style');
	if (!style || style.trim() === '') {
		return null;
	}

	for (const declaration of style.split(';')) {
		const separatorIndex = declaration.indexOf(':');
		if (separatorIndex <= 0) {
			continue;
		}

		const name = declaration.slice(0, separatorIndex).trim();
		const value = declaration.slice(separatorIndex + 1).trim();
		if (name === attributeName && value !== '') {
			return value;
		}
	}

	return null;
}

function resolveFontSize(target: XmlElement): number {
	const directFontSize = getAttributeOrStyleValue(target, 'font-size');
	const parsedDirect = parseSvgLength(directFontSize, NaN);
	if (Number.isFinite(parsedDirect) && parsedDirect > 0) {
		return parsedDirect;
	}

	let parent: XmlNode | null = target.parentNode;
	while (parent && parent.nodeType === 1) {
		const value = getAttributeOrStyleValue(parent as XmlElement, 'font-size');
		const parsed = parseSvgLength(value, NaN);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
		parent = parent.parentNode;
	}

	return 16;
}

function resolveLineHeight(target: XmlElement, fontSize: number): number {
	const lineHeightValue = getAttributeOrStyleValue(target, 'line-height');
	if (!lineHeightValue || lineHeightValue === 'normal') {
		return fontSize * 1.25;
	}

	if (lineHeightValue.endsWith('%')) {
		const percentage = Number.parseFloat(lineHeightValue.slice(0, -1));
		if (Number.isFinite(percentage) && percentage > 0) {
			return (fontSize * percentage) / 100;
		}
	}

	const parsedLineHeight = parseSvgLength(lineHeightValue, NaN);
	if (Number.isFinite(parsedLineHeight) && parsedLineHeight > 0) {
		return parsedLineHeight;
	}

	return fontSize * 1.25;
}
