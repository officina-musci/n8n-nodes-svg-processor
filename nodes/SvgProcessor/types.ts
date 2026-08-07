export type SvgProcessorOperation =
	| 'insertText'
	| 'insertImage'
	| 'convertPdf'
	| 'convertJpg'
	| 'convertPng'
	| 'convertStringToSvg';

export type ImageResizeMode = 'none' | 'contain' | 'cover';

export type OverflowHandling = 'show' | 'hide';

export interface TextInsertionRow {
	targetElementId: string;
	content: string;
}

export interface ImageInsertionRow {
	targetElementId: string;
	imageBinaryPropertyName: string | Record<string, unknown>;
	resizeMode: ImageResizeMode;
	preserveAspectRatio: boolean;
	forceResizeIfSmaller: boolean;
	overflowHandling: OverflowHandling;
}

export interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ProcessedImage {
	buffer: Buffer;
	mimeType: string;
	format: 'png' | 'jpg' | 'svg';
	width: number;
	height: number;
}
