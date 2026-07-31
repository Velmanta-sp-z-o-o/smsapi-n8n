# n8n-nodes-smsapi

An n8n community node for sending SMS messages through [SMSAPI](https://www.smsapi.pl/).

The node loads active sender names directly from SMSAPI and sends SMS messages using an SMSAPI OAuth token.

## Features

- Send SMS messages through SMSAPI
- Load active sender names dynamically
- Authenticate with an SMSAPI OAuth token
- Retry temporary SMSAPI and HTTP errors
- Prevent duplicate messages during retries with `idx` and `check_idx`
- Support UTF-8 message content
- Support multiple incoming n8n items
- Support n8n's **Continue On Fail** behavior
- Avoid returning the recipient phone number or message content in the node output

## Requirements

- An n8n instance that supports community nodes
- An active SMSAPI account
- An SMSAPI OAuth token with permissions to:
  - send SMS messages
  - read sender names

The token should include the permissions required for SMS sending and sender-name access, commonly referred to as `sms` and `sms_sender`.

## Installation

### n8n Community Nodes interface

1. Open your n8n instance.
2. Go to **Settings**.
3. Open **Community Nodes**.
4. Select **Install**.
5. Enter:

```text
n8n-nodes-smsapi
```

6. Confirm the installation.

Community node installation availability depends on your n8n deployment and configuration.

### Manual installation

From the n8n custom nodes directory, install the package:

```bash
npm install n8n-nodes-smsapi
```

Restart n8n after installation.

## Credentials

Create a new **SMSAPI API** credential in n8n.

Enter your SMSAPI OAuth token in the **API Token** field.

The credential sends the token using the following HTTP header:

```text
Authorization: Bearer <token>
```

The credential test requests the active sender-name endpoint in SMSAPI.

## Node parameters

### SMS Recipient (Phone Number)

The recipient's phone number, including the country code.

Example:

```text
+48500100200
```

Spaces, parentheses, hyphens, and a leading plus sign are removed before the request is sent.

### SMS Body

The SMS message content.

The node sends the message using:

```text
encoding=utf-8
```

The node does not remove or transliterate Polish characters.

### Sender Name or ID

An active sender name loaded directly from SMSAPI.

You may choose a sender from the list or provide the value through an n8n expression.

## SMSAPI request

The node sends messages to:

```text
POST https://api.smsapi.pl/sms.do
```

The request includes:

```text
from
to
message
format=json
encoding=utf-8
partner_id=JKJV
idx
check_idx=1
```

## Retry behavior

The node performs up to five attempts for temporary failures.

Retry delays use exponential backoff:

```text
1 second
2 seconds
4 seconds
8 seconds
```

Retries may occur for:

- SMSAPI error `200`
- SMSAPI error `201`
- SMSAPI error `202`
- SMSAPI error `999`
- HTTP `429`
- HTTP `5xx`
- connection failures
- request timeouts

Permanent SMSAPI errors are returned immediately without retrying.

## Duplicate protection

For every input item, the node generates a unique request identifier and sends:

```text
idx=<request-id>
check_idx=1
```

All retries for the same input item use the same `idx`.

This reduces the risk of sending the same message more than once when SMSAPI accepts a request but the response is lost.

If SMSAPI returns duplicate error `53`, the node treats it as a successfully prevented duplicate.

## Output

A successful execution returns a limited response that avoids exposing the recipient phone number and message body.

Example:

```json
{
  "success": true,
  "requestId": "7bc974946c2b4fd5a96e83442eb9a235",
  "attempts": 1,
  "duplicatePrevented": false,
  "count": 1,
  "id": "6A6B4DF4653631129181D50F",
  "points": 0.17,
  "status": "QUEUE",
  "idx": "7bc974946c2b4fd5a96e83442eb9a235"
}
```

The exact fields depend on the SMSAPI response.

## Error handling

When **Continue On Fail** is disabled, the node throws an n8n operation error.

When **Continue On Fail** is enabled, the node returns an item similar to:

```json
{
  "success": false,
  "error": "SMSAPI error 13: No correct phone numbers"
}
```

## Privacy and execution data

The node does not intentionally return the SMS recipient or message body in successful output.

However, n8n may still store input data and parameter values in workflow execution history depending on the instance configuration.

Administrators should configure execution-data retention according to their privacy and compliance requirements.

## Development

Install development dependencies:

```bash
npm install
```

Run the linter:

```bash
npm run lint
```

Build the package:

```bash
npm run build
```

Run the local n8n development environment:

```bash
npm run dev
```

Inspect the package before publishing:

```bash
npm pack --dry-run
```

## Project structure

```text
credentials/
  SmsApi.credentials.ts

nodes/
  SmsApi/
    SmsApi.node.ts
    SmsApi.node.json
    logo-sms-api.png
    logo-sms-api.dark.png
```

## Security

- The SMSAPI token is stored as an n8n credential.
- Requests are restricted to the SMSAPI domain.
- Cross-origin credential forwarding is disabled.
- Redirect following is disabled for authenticated requests.
- Requests use a 30-second timeout.
- The node does not use runtime dependencies outside n8n and Node.js.

Never commit real SMSAPI tokens, recipient phone numbers, or production execution data to the repository.

## Support

Report issues through mail:

```text
support@velmanta.com
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file.

## Disclaimer

This is an independent n8n community node.

SMSAPI is a trademark of its respective owner. This project is an official SMSAPI product.
