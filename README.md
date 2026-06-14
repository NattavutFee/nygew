# ERSSmartBuddy

Employee expense assistant for receipt-to-draft workflows.

## Run

Set an OpenAI API key on the server environment, then start the app:

```bash
export OPENAI_API_KEY="your_api_key"
node server.js
```

Then visit `http://localhost:4173`.

## Receipt Extraction API

`POST /api/receipt/extract`

Input: multipart form data with a receipt image file (JPG or PNG) in the `receipt` field.

Output:

```json
{
  "merchantName": "string",
  "recieptCategory": "string",
  "totalAmt": 0,
  "vatAmt": 0,
  "score": 0
}
```

The frontend previews the uploaded receipt image, calls this API, displays the returned JSON, and fills the editable expense draft fields for employee review.
