import { randomUUID } from 'node:crypto';

import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	NodeConnectionTypes,
	NodeOperationError,
	sleep,
} from 'n8n-workflow';

const SMSAPI_BASE_URL = 'https://api.smsapi.pl';
const SMSAPI_PARTNER_ID = 'JKJV';

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [
	1_000,
	2_000,
	4_000,
	8_000,
] as const;

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

const RETRYABLE_SMSAPI_ERRORS = new Set([
	200,
	201,
	202,
	999,
]);

interface SmsApiSenderName {
	sender?: string;
	status?: string;
}

interface SmsApiSenderNamesResponse {
	collection?: SmsApiSenderName[];
}

interface SmsApiFullResponse {
	body: unknown;
	statusCode: number;
	headers?: Record<string, unknown>;
}

interface ParsedSmsApiResponse {
	data: IDataObject;
	isValidObject: boolean;
}

interface SmsApiSendResult {
	response: IDataObject;
	attempts: number;
	duplicatePrevented: boolean;
}

function isObject(
	value: unknown,
): value is Record<string, unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value)
	);
}

function isPrimitive(
	value: unknown,
): value is string | number | boolean {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	);
}

function parseSmsApiResponse(
	body: unknown,
	httpStatus: number,
): ParsedSmsApiResponse {
	if (isObject(body)) {
		return {
			data: body as IDataObject,
			isValidObject: true,
		};
	}

	let responseText: string;

	if (Buffer.isBuffer(body)) {
		responseText = body.toString('utf8');
	} else if (typeof body === 'string') {
		responseText = body;
	} else {
		responseText = String(body ?? '');
	}

		try {
		const parsed: unknown = JSON.parse(responseText);

		if (isObject(parsed)) {
			return {
				data: parsed as IDataObject,
				isValidObject: true,
			};
		}
	} catch {
		return {
			data: {
				httpStatus,
				content: responseText,
			},
			isValidObject: false,
		};
	}

	return {
		data: {
			httpStatus,
			content: responseText,
		},
		isValidObject: false,
	};
}

function getSmsApiErrorCode(
	response: IDataObject,
): number | undefined {
	const errorCode = response.error;

	if (typeof errorCode === 'number') {
		return Number.isFinite(errorCode)
			? errorCode
			: undefined;
	}

	if (
		typeof errorCode === 'string' &&
		errorCode.trim() !== ''
	) {
		const parsedErrorCode = Number(errorCode);

		return Number.isFinite(parsedErrorCode)
			? parsedErrorCode
			: undefined;
	}

	return undefined;
}

function getSmsApiErrorMessage(
	response: IDataObject,
	fallback: string,
): string {
	if (
		typeof response.message === 'string' &&
		response.message.trim() !== ''
	) {
		return response.message;
	}

	if (
		typeof response.content === 'string' &&
		response.content.trim() !== ''
	) {
		return response.content;
	}

	return fallback;
}

function createSafeResponseSummary(
	response: IDataObject,
	duplicatePrevented: boolean,
): IDataObject {
	const summary: IDataObject = {
		duplicatePrevented,
	};

	if (isPrimitive(response.count)) {
		summary.count = response.count;
	}

	if (duplicatePrevented) {
		summary.status = 'duplicate_prevented';
		summary.message =
			'SMSAPI has already accepted a message with this request ID';

		return summary;
	}

	const responseList = response.list;

	if (
		!Array.isArray(responseList) ||
		responseList.length === 0 ||
		!isObject(responseList[0])
	) {
		return summary;
	}

	const firstMessage = responseList[0];

	const allowedProperties = [
		'id',
		'points',
		'status',
		'idx',
		'error',
	] as const;

	for (const property of allowedProperties) {
		const value = firstMessage[property];

		if (isPrimitive(value)) {
			summary[property] = value;
		}
	}

	return summary;
}

export class SmsApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SMS API - Send an SMS',
		name: 'smsApi',
		icon: {
			light: 'file:sms-api-n8n.png',
			dark: 'file:sms-api-n8n-dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["senderName"] ? "From: " + $parameter["senderName"] : "Send SMS"}}',
		description: 'Send an SMS using SMSAPI',
		defaults: {
			name: 'SMS API',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],

		credentials: [
			{
				name: 'smsApi',
				required: true,
			},
		],

		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send SMS',
						value: 'send',
						description: 'Send an SMS message',
						action: 'Send an SMS',
					},
				],
				default: 'send',
			},
			{
				displayName:
					'SMS Recipient (Phone Number)',
				name: 'recipient',
				type: 'string',
				default: '',
				placeholder: '+48123123123',
				description:
					'Recipient phone number with country prefix',
				required: true,
			},
			{
				displayName: 'SMS Body',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'Enter SMS message',
				description:
					'Content of the SMS message',
				required: true,
			},
			{
				displayName: 'Sender Name or ID',
				name: 'senderName',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getSenderNames',
				},
				default: '',
				placeholder: 'Select sender',
				description: 'Sender name loaded directly from SMSAPI or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
			},
		],
		usableAsTool: true,
	};

	methods = {
		loadOptions: {
			async getSenderNames(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const response =
					(await this.helpers
						.httpRequestWithAuthentication.call(
							this,
							'smsApi',
							{
								method: 'GET',
								url:
									`${SMSAPI_BASE_URL}/sms/sendernames`,
								headers: {
									Accept:
										'application/json',
								},
								json: true,
								timeout:
									REQUEST_TIMEOUT_MS,
								disableFollowRedirect:
									true,
								sendCredentialsOnCrossOriginRedirect:
									false,
								allowedDomains:
									'api.smsapi.pl',
							},
						)) as SmsApiSenderNamesResponse;

				if (
					!Array.isArray(
						response.collection,
					)
				) {
					return [];
				}

				return response.collection
					.filter(
						(
							item,
						): item is SmsApiSenderName & {
							sender: string;
						} =>
							typeof item.sender ===
								'string' &&
							item.sender.trim().length >
								0 &&
							item.status?.toUpperCase() ===
								'ACTIVE',
					)
					.map((item) => ({
						name: item.sender,
						value: item.sender,
					}))
					.sort((a, b) =>
						a.name.localeCompare(
							b.name,
							'pl',
						),
					);
			},
		},
	};

	async execute(
		this: IExecuteFunctions,
	): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const abortSignal =
			this.getExecutionCancelSignal();

		for (
			let itemIndex = 0;
			itemIndex < items.length;
			itemIndex++
		) {
			try {
				const recipient =
					this.getNodeParameter(
						'recipient',
						itemIndex,
					) as string;

				const message =
					this.getNodeParameter(
						'message',
						itemIndex,
					) as string;

				const senderName =
					this.getNodeParameter(
						'senderName',
						itemIndex,
					) as string;

				const normalizedRecipient =
					recipient
						.trim()
						.replace(/[\s()-]/g, '')
						.replace(/^\+/, '');

				const normalizedSenderName =
					senderName.trim();

				if (!normalizedRecipient) {
					throw new NodeOperationError(
						this.getNode(),
						'Recipient phone number is required',
						{ itemIndex },
					);
				}

				if (
					!/^\d+$/.test(
						normalizedRecipient,
					)
				) {
					throw new NodeOperationError(
						this.getNode(),
						'Recipient phone number can contain only digits and an optional leading plus sign',
						{ itemIndex },
					);
				}

				if (!message.trim()) {
					throw new NodeOperationError(
						this.getNode(),
						'SMS message cannot be empty',
						{ itemIndex },
					);
				}

				if (!normalizedSenderName) {
					throw new NodeOperationError(
						this.getNode(),
						'Sender name is required',
						{ itemIndex },
					);
				}

				const requestId = randomUUID()
					.replace(/-/g, '')
					.slice(0, 32);

				const requestBody =
					new URLSearchParams({
						from:
							normalizedSenderName,
						to: normalizedRecipient,
						message,
						format: 'json',
						partner_id:
							SMSAPI_PARTNER_ID,
						encoding: 'utf-8',
						idx: requestId,
						check_idx: '1',
					}).toString();

				let sendResult:
					| SmsApiSendResult
					| undefined;

				for (
					let attempt = 1;
					attempt <= MAX_ATTEMPTS;
					attempt++
				) {
					if (abortSignal?.aborted) {
						throw new NodeOperationError(
							this.getNode(),
							'Execution was cancelled',
							{ itemIndex },
						);
					}

					let fullResponse: SmsApiFullResponse;

					try {
						fullResponse =
							(await this.helpers
								.httpRequestWithAuthentication.call(
									this,
									'smsApi',
									{
										method: 'POST',
										url:
											`${SMSAPI_BASE_URL}/sms.do`,
										headers: {
											Accept:
												'application/json',
											'Content-Type':
												'application/x-www-form-urlencoded',
										},
										body: requestBody,
										encoding:
											'text',
										returnFullResponse:
											true,
										ignoreHttpStatusErrors:
											true,
										timeout:
											REQUEST_TIMEOUT_MS,
										abortSignal,
										disableFollowRedirect:
											true,
										sendCredentialsOnCrossOriginRedirect:
											false,
										allowedDomains:
											'api.smsapi.pl',
									},
								)) as SmsApiFullResponse;
					} catch (requestError) {
						if (abortSignal?.aborted) {
							const cancellationError =
								requestError instanceof Error
									? requestError
									: new Error(String(requestError));

							throw new NodeOperationError(
								this.getNode(),
								cancellationError,
								{ itemIndex },
							);
						}

						if (
							attempt <
							MAX_ATTEMPTS
						) {
							const delay =
								RETRY_DELAYS_MS[
									attempt - 1
								];

							await sleep(delay);
							continue;
						}

						const normalizedRequestError =
							requestError instanceof
							Error
								? requestError
								: new Error(
										String(
											requestError,
										),
									);

						throw new NodeOperationError(
							this.getNode(),
							normalizedRequestError,
							{ itemIndex },
						);
					}

					const parsedResponse =
						parseSmsApiResponse(
							fullResponse.body,
							fullResponse.statusCode,
						);

					const result =
						parsedResponse.data;

					const errorCode =
						getSmsApiErrorCode(result);

					if (errorCode === 53) {
						sendResult = {
							response: result,
							attempts: attempt,
							duplicatePrevented:
								true,
						};

						break;
					}

					const isRetryableError =
						(errorCode !== undefined &&
							RETRYABLE_SMSAPI_ERRORS.has(
								errorCode,
							)) ||
						fullResponse.statusCode ===
							429 ||
						fullResponse.statusCode >=
							500;

					if (isRetryableError) {
						if (
							attempt <
							MAX_ATTEMPTS
						) {
							const delay =
								RETRY_DELAYS_MS[
									attempt - 1
								];

							await sleep(delay);
							continue;
						}

						const errorMessage =
							getSmsApiErrorMessage(
								result,
								`Request failed after ${MAX_ATTEMPTS} attempts`,
							);

						throw new NodeOperationError(
							this.getNode(),
							`SMSAPI error ${
								errorCode ??
								fullResponse.statusCode
							}: ${errorMessage}`,
							{ itemIndex },
						);
					}

					if (
						!parsedResponse.isValidObject
					) {
						throw new NodeOperationError(
							this.getNode(),
							getSmsApiErrorMessage(
								result,
								'Invalid response received from SMSAPI',
							),
							{ itemIndex },
						);
					}

					if (
						errorCode !== undefined
					) {
						const errorMessage =
							getSmsApiErrorMessage(
								result,
								'Unknown SMSAPI error',
							);

						throw new NodeOperationError(
							this.getNode(),
							`SMSAPI error ${errorCode}: ${errorMessage}`,
							{ itemIndex },
						);
					}

					if (
						fullResponse.statusCode <
							200 ||
						fullResponse.statusCode >=
							300
					) {
						const errorMessage =
							getSmsApiErrorMessage(
								result,
								`HTTP ${fullResponse.statusCode}`,
							);

						throw new NodeOperationError(
							this.getNode(),
							`SMSAPI HTTP error ${fullResponse.statusCode}: ${errorMessage}`,
							{ itemIndex },
						);
					}

					sendResult = {
						response: result,
						attempts: attempt,
						duplicatePrevented:
							false,
					};

					break;
				}

				if (!sendResult) {
					throw new NodeOperationError(
						this.getNode(),
						`SMS was not sent after ${MAX_ATTEMPTS} attempts`,
						{ itemIndex },
					);
				}

				returnData.push({
					json: {
						success: true,
						requestId,
						attempts:
							sendResult.attempts,
						...createSafeResponseSummary(
							sendResult.response,
							sendResult.duplicatePrevented,
						),
					},
					pairedItem: {
						item: itemIndex,
					},
				});
			} catch (error) {
				const normalizedError =
					error instanceof Error
						? error
						: new Error(String(error));

				const nodeError =
					error instanceof
					NodeOperationError
						? error
						: new NodeOperationError(
								this.getNode(),
								normalizedError,
								{ itemIndex },
							);

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...items[itemIndex]
								.json,
							success: false,
							error:
								nodeError.message,
						},
						pairedItem: {
							item: itemIndex,
						},
					});

					continue;
				}

				throw nodeError;
			}
		}

		return [returnData];
	}
}