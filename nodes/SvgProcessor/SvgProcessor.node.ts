import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	appendTextToTarget,
	buildProcessedImage,
	convertSvgToJpg,
	convertSvgToPdf,
	convertSvgToPng,
	ensureImageInsertions,
	ensureTextInsertions,
	extensionForMimeType,
	insertImageIntoTarget,
	parseSvgDocument,
	serializeSvgDocument,
} from './helpers';
import type { SvgProcessorOperation } from './types';

export class SvgProcessor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SVG Processor',
		name: 'svgProcessor',
		icon: { light: 'file:svg-processor.svg', dark: 'file:svg-processor.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description: 'Process SVG files and templates and export to PDF/JPG/PNG',
		defaults: {
			name: 'SVG Processor',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'insertContent',
				options: [
					{
						name: 'Insert Content',
						value: 'insertContent',
					},
					{
						name: 'Conversion',
						value: 'export',
					},
				],
			},
			...insertContentOperationProperties,
			...exportOperationProperties,
			{
				displayName: 'Property Name',
				name: 'templateBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					hide: {
						operation: ['convertStringToSvg'],
					},
				},
				description: 'Name of the binary property in which the SVG template data can be found',
			},
			{
				displayName: 'SVG String',
				name: 'svgStringContent',
				type: 'string',
				typeOptions: {
					rows: 6,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertStringToSvg'],
					},
				},
				description: 'SVG markup string to validate and convert into an SVG binary file',
			},
			...textInsertionProperties,
			...imageInsertionProperties,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Destination Output Field',
						name: 'destinationKey',
						type: 'string',
						default: 'data',
						placeholder: 'e.g. data',
						description: 'The name of the output field that will contain the file data',
					},
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description: 'Base output filename without extension',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as SvgProcessorOperation;
				const templateBinaryPropertyName = this.getNodeParameter(
					'templateBinaryPropertyName',
					itemIndex,
					'data',
				) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
				const outputBinaryPropertyName =
					typeof options.destinationKey === 'string' && options.destinationKey.trim() !== ''
						? options.destinationKey
						: 'data';

				let templateSvg = '';
				let sourceBaseFileName = '';

				if (operation !== 'convertStringToSvg') {
					templateSvg = (await this.helpers.getBinaryDataBuffer(itemIndex, templateBinaryPropertyName)).toString('utf8');
					const templateMetadata = items[itemIndex].binary?.[templateBinaryPropertyName];
					sourceBaseFileName = getBaseNameWithoutExtension(templateMetadata?.fileName);
				}

				const configuredFileName =
					typeof options.fileName === 'string' && options.fileName.trim() !== '' ? options.fileName.trim() : '';
				const outputFileName = configuredFileName || sourceBaseFileName || 'svg-processor-output';

				let outputBuffer: Buffer;
				let mimeType: string;
				let outputSvg: string | undefined;
				let insertionCount = 0;

				if (operation === 'insertText') {
					const targetElementsText = this.getNodeParameter('targetElementsText', itemIndex, {
						values: [],
					});
					const insertions = ensureTextInsertions(targetElementsText);
					if (insertions.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one target text insertion is required', {
							itemIndex,
						});
					}

					const document = parseSvgDocument(templateSvg);
					for (const insertion of insertions) {
						appendTextToTarget(document, insertion);
					}

					outputSvg = serializeSvgDocument(document);
					outputBuffer = Buffer.from(outputSvg, 'utf8');
					mimeType = 'image/svg+xml';
					insertionCount = insertions.length;
				} else if (operation === 'insertImage') {
					const targetElementsImage = this.getNodeParameter('targetElementsImage', itemIndex, {
						values: [],
					});
					const insertions = ensureImageInsertions(targetElementsImage);
					if (insertions.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one target image insertion is required', {
							itemIndex,
						});
					}

					const document = parseSvgDocument(templateSvg);
					for (let insertionIndex = 0; insertionIndex < insertions.length; insertionIndex++) {
						const insertion = insertions[insertionIndex];

						let imageBuffer: Buffer;
						let imageMimeType: string | undefined;

						if (typeof insertion.imageBinaryPropertyName === 'string') {
							imageBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, insertion.imageBinaryPropertyName);
							const imageBinaryData = items[itemIndex].binary?.[insertion.imageBinaryPropertyName];
							imageMimeType = imageBinaryData?.mimeType;

							if (!imageMimeType) {
								throw new NodeOperationError(
									this.getNode(),
									`Image binary property "${insertion.imageBinaryPropertyName}" must include a mime type`,
									{ itemIndex },
								);
							}
						} else {
							const binaryPayload = insertion.imageBinaryPropertyName as IDataObject;
							const payloadMimeType = binaryPayload.mimeType;
							const firstBinaryEntry = Object.entries(binaryPayload).find(([, value]) => {
								if (!value || typeof value !== 'object') {
									return false;
								}

								const candidate = value as IDataObject;
								return typeof candidate.data === 'string' && typeof candidate.mimeType === 'string';
							});

							if (!payloadMimeType && firstBinaryEntry) {
								const [binaryKey] = firstBinaryEntry;
								throw new NodeOperationError(
									this.getNode(),
									`Insert Image Content expression resolved to the full binary map. Use a single binary entry such as {{$('HTTP Request').item.binary.${binaryKey}}}`,
									{ itemIndex },
								);
							}

							if (typeof payloadMimeType !== 'string' || payloadMimeType.trim() === '') {
								throw new NodeOperationError(
									this.getNode(),
									'Insert Image Content expression must include mimeType in the binary object',
									{ itemIndex },
								);
							}

							const tempBinaryPropertyName = `__svgProcessorImage_${itemIndex}_${insertionIndex}`;
							const currentBinary = items[itemIndex].binary ?? {};
							const previousValue = currentBinary[tempBinaryPropertyName];
							items[itemIndex].binary = {
								...currentBinary,
								[tempBinaryPropertyName]: binaryPayload as unknown as IBinaryData,
							};

							try {
								imageBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, tempBinaryPropertyName);
							} catch {
								throw new NodeOperationError(
									this.getNode(),
									'Insert Image Content expression must resolve to a valid n8n binary object (for example binary.data)',
									{ itemIndex },
								);
							} finally {
								if (previousValue !== undefined) {
									items[itemIndex].binary![tempBinaryPropertyName] = previousValue;
								} else {
									const itemBinary = items[itemIndex].binary;
									if (itemBinary) {
										delete itemBinary[tempBinaryPropertyName];
									}
								}
							}

							imageMimeType = payloadMimeType;
						}

						const processedImage = buildProcessedImage(imageBuffer, imageMimeType);
						insertImageIntoTarget(
							document,
							insertion,
							processedImage,
							`${insertion.targetElementId}-${itemIndex}-${insertionIndex}`,
						);
					}

					outputSvg = serializeSvgDocument(document);
					outputBuffer = Buffer.from(outputSvg, 'utf8');
					mimeType = 'image/svg+xml';
					insertionCount = insertions.length;
				} else if (operation === 'convertPdf') {
					parseSvgDocument(templateSvg);
					outputBuffer = await convertSvgToPdf(templateSvg);
					mimeType = 'application/pdf';
				} else if (operation === 'convertJpg') {
					parseSvgDocument(templateSvg);
					outputBuffer = convertSvgToJpg(templateSvg);
					mimeType = 'image/jpeg';
				} else if (operation === 'convertStringToSvg') {
					const svgStringContent = this.getNodeParameter('svgStringContent', itemIndex, '') as string;
					if (svgStringContent.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'SVG String cannot be empty', { itemIndex });
					}

					const document = parseSvgDocument(svgStringContent);
					outputSvg = serializeSvgDocument(document);
					outputBuffer = Buffer.from(outputSvg, 'utf8');
					mimeType = 'image/svg+xml';
				} else {
					parseSvgDocument(templateSvg);
					outputBuffer = convertSvgToPng(templateSvg);
					mimeType = 'image/png';
				}

				const extension = extensionForMimeType(mimeType);
				const safeBaseName = outputFileName.trim() === '' ? 'svg-processor-output' : outputFileName.trim();
				const fileName = `${safeBaseName}.${extension}`;
				const preparedBinary = await this.helpers.prepareBinaryData(outputBuffer, fileName, mimeType);

				returnData.push({
					json: {
						operation,
						mimeType,
						binaryProperty: outputBinaryPropertyName,
						insertionsApplied: insertionCount,
						outputFileName: fileName,
						outputSizeBytes: outputBuffer.length,
						isSvgOutput: mimeType === 'image/svg+xml',
						svgPreview: outputSvg,
					},
					binary: {
						[outputBinaryPropertyName]: preparedBinary,
					},
					pairedItem: {
						item: itemIndex,
					},
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}

				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}

const insertContentOperationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['insertContent'],
			},
		},
		options: [
			{
				name: 'Insert Image',
				value: 'insertImage',
				action: 'Insert image',
				description: 'Insert one or more images into SVG shape containers',
			},
			{
				name: 'Insert Text',
				value: 'insertText',
				action: 'Insert text',
				description: 'Replace text in one or more text elements in the SVG',
			},
		],
		default: 'insertText',
	},
];

const exportOperationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['export'],
			},
		},
		options: [
			{
				name: 'Convert String to SVG',
				value: 'convertStringToSvg',
				action: 'Convert string to SVG',
				description: 'Convert an SVG markup string to an SVG binary file',
			},
			{
				name: 'Convert SVG to JPG',
				value: 'convertJpg',
				action: 'Convert SVG to JPG',
				description: 'Convert the SVG template to a JPG binary file',
			},
			{
				name: 'Convert SVG to PDF',
				value: 'convertPdf',
				action: 'Convert SVG to PDF',
				description: 'Convert the SVG template to a PDF binary file',
			},
			{
				name: 'Convert SVG to PNG',
				value: 'convertPng',
				action: 'Convert SVG to PNG',
				description: 'Convert the SVG template to a PNG binary file',
			},
		],
		default: 'convertPdf',
	},
];

const textInsertionProperties: INodeProperties[] = [
	{
		displayName: 'Target Elements',
		name: 'targetElementsText',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		placeholder: 'Add Target Element',
		default: {
			values: [
				{
					targetElementId: '',
					content: '',
				},
			],
		},
		required: true,
		description: 'Text insertion rows, each with target element ID and replacement text content',
		displayOptions: {
			show: {
				operation: ['insertText'],
			},
		},
		options: [
			{
				displayName: 'Element',
				name: 'values',
				values: [
					{
						displayName: 'Target Element ID',
						name: 'targetElementId',
						type: 'string',
						default: '',
						required: true,
						description: 'ID of a &lt;text&gt; or &lt;tspan&gt; element in the SVG template',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: {
							rows: 4,
						},
						default: '',
						required: true,
						description: 'Text content used to replace the target text element content',
					},
				],
			},
		],
	},
];

const imageInsertionProperties: INodeProperties[] = [
	{
		displayName: 'Target Elements',
		name: 'targetElementsImage',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		placeholder: 'Add Target Element',
		default: {
			values: [
				{
					targetElementId: '',
					imageBinaryPropertyName: '',
					resizeMode: 'contain',
					preserveAspectRatio: true,
					forceResizeIfSmaller: true,
					overflowHandling: 'hide',
				},
			],
		},
		required: true,
		description: 'Image insertion rows with target shape, image binary source, and resize behavior',
		displayOptions: {
			show: {
				operation: ['insertImage'],
			},
		},
		options: [
			{
				displayName: 'Element',
				name: 'values',
				// Keep dependent controls grouped in the UI (Preserve Aspect Ratio -> Overflow Handling).
				// eslint-disable-next-line n8n-nodes-base/node-param-fixed-collection-type-unsorted-items
				values: [
					{
						displayName: 'Target Element ID',
						name: 'targetElementId',
						type: 'string',
						default: '',
						required: true,
						description: 'ID of a supported SVG shape element that receives the inserted image',
					},
					{
						displayName: 'Content',
						name: 'imageBinaryPropertyName',
						type: 'string',
						default: '',
						required: true,
						description:
							'Binary property containing the image content (PNG, JPG, or SVG), or an expression resolving directly to a binary object with data and mimeType. Keep property names distinct from Property Name.',
					},
					{
						displayName: 'Resize Mode',
						name: 'resizeMode',
						type: 'options',
						default: 'contain',
						options: [
							{
								name: 'None',
								value: 'none',
							},
							{
								name: 'Contain',
								value: 'contain',
							},
							{
								name: 'Cover',
								value: 'cover',
							},
						],
						description: 'How the image fits inside the target container shape',
					},
					{
						displayName: 'Preserve Aspect Ratio',
						name: 'preserveAspectRatio',
						type: 'boolean',
						default: true,
						displayOptions: {
							show: {
								resizeMode: ['cover'],
							},
						},
						description:
							'Whether to preserve image proportions while resizing in Cover mode. Contain mode always preserves the aspect ratio.',
					},
					{
						displayName: 'Overflow Handling',
						name: 'overflowHandling',
						type: 'options',
						default: 'hide',
						options: [
							{
								name: 'Show',
								value: 'show',
							},
							{
								name: 'Hide',
								value: 'hide',
							},
						],
						description:
							'How to handle overflow for the inserted image across all resize modes. Use Hide to clip the image to the target shape bounds.',
					},
				],
			},
		],
	},
];

function getBaseNameWithoutExtension(fileName?: string): string {
	if (!fileName) {
		return '';
	}

	const normalizedFileName = fileName.trim();
	if (normalizedFileName === '') {
		return '';
	}

	const lastDotIndex = normalizedFileName.lastIndexOf('.');
	if (lastDotIndex <= 0) {
		return normalizedFileName;
	}

	return normalizedFileName.slice(0, lastDotIndex);
}
