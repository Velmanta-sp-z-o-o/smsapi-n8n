import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class SmsApi implements ICredentialType {
	name = 'smsApi';

	displayName = 'SMSAPI API';

	icon: Icon = {
		light: 'file:../nodes/SmsApi/sms-api-n8n.png',
		dark: 'file:../nodes/SmsApi/sms-api-n8n-dark.png',
	};

	documentationUrl = 'https://www.smsapi.pl/docs/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token SMS API',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'OAuth token with SMS and sender-name permissions',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization:
					'=Bearer {{$credentials.token}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.smsapi.pl',
			url: '/sms/sendernames',
			method: 'GET',
		},
	};
}