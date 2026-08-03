# @velmanta/n8n-nodes-smsapi

An n8n community node for sending SMS messages through [SMSAPI](https://www.smsapi.pl/).

## Features

* Send SMS messages through SMSAPI
* Load active sender names automatically
* Authenticate using an SMSAPI OAuth token
* Retry temporary API and network errors
* Prevent duplicate messages during retries
* Support multiple input items
* Support n8n's **Continue On Fail**
* Avoid returning phone numbers and message content in the node output

## Requirements

* An n8n instance that supports community nodes
* An active SMSAPI account
* An SMSAPI OAuth token with permissions to:

  * send SMS messages
  * read sender names

The required permissions are commonly named `sms` and `sms_sender`.

## Installation

### n8n Community Nodes

1. Open your n8n instance.
2. Go to **Settings**.
3. Open **Community Nodes**.
4. Select **Install**.
5. Enter:

```text
@velmanta/n8n-nodes-smsapi
```

6. Confirm the installation.

### Manual installation

From the n8n custom nodes directory, run:

```bash
npm install @velmanta/n8n-nodes-smsapi
```

Restart n8n after installation.

## Configuration

1. Create an **SMSAPI API** credential in n8n.
2. Enter your SMSAPI OAuth token.
3. Add the **SMSAPI** node to a workflow.
4. Configure:

   * **SMS Recipient** â€” phone number including the country code
   * **SMS Body** â€” message content
   * **Sender Name or ID** â€” an active sender name from SMSAPI

Example phone number:

```text
+48500100200
```

Messages are sent using UTF-8 encoding.

## Error handling

The node retries temporary SMSAPI, HTTP, connection, and timeout errors.

To reduce the risk of duplicate messages during retries, the node uses SMSAPI request identifiers with duplicate checking.

When **Continue On Fail** is enabled, errors are returned as workflow items instead of stopping the workflow.

## Privacy

The node does not intentionally return the recipient phone number or message body in its output.

n8n may still store input data and node parameters in workflow execution history. Configure execution-data retention according to your privacy and compliance requirements.

Never commit real SMSAPI tokens, phone numbers, or production execution data to the repository.

## Support

Report issues by email:

```text
support@velmanta.com
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file.

## Disclaimer

This is an independently maintained n8n community node.

SMSAPI is a trademark of its respective owner. This project is an official SMSAPI product.

