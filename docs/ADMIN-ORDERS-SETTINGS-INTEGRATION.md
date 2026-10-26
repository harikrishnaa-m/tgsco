# Admin Orders and Settings Integration

Base URL: `http://localhost:5000/api/v1`

All endpoints in this document, except Admin Login, require:

```http
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

The standalone Postman collection is `postman/TGSCO Admin Orders Settings API.postman_collection.json`.
Run **Admin > Authentication > Admin Login** first. Its test script stores
`admin_token`; successful order and settings requests also capture reusable IDs.

## Authentication

### `POST /auth/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

The response contains the access token under `data.accessToken` (or
`data.token` for compatible authentication responses). The collection stores
it in `admin_token`.

## Orders

### `GET /admin/orders`

Lists orders with pagination. Query parameters:

| Parameter | Description |
|---|---|
| `search` | Searches order number, recipient name, or recipient mobile |
| `status` | Exact order status |
| `paymentStatus` | Exact payment status |
| `from` | Inclusive valid date |
| `to` | Inclusive valid date |
| `sort` | `newest` (default), `oldest`, or `total` |
| `page` | Positive page number, default `1` |
| `limit` | `1`–`100`, default `20` |

Response shape:

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "limit": 20,
    "pages": 0
  }
}
```

### `GET /admin/orders/filters`

Returns static and order-derived filter values:

```json
{
  "success": true,
  "data": {
    "orderStatuses": ["pending_payment", "confirmed"],
    "paymentStatuses": ["pending", "captured"],
    "chargeTypes": ["shipping", "packing"],
    "couriers": ["Delhivery"],
    "currencies": ["INR"],
    "totals": {
      "min": 500,
      "max": 12500,
      "earliest": "2026-10-01T00:00:00.000Z",
      "latest": "2026-10-26T00:00:00.000Z"
    }
  }
}
```

`couriers`, `currencies`, and totals are derived from stored orders. Empty
collections may be returned when no orders have been created.

### `GET /admin/orders/:id`

Returns the complete order document, including product IDs, address snapshots,
seller/invoice snapshot, applied charges, tax breakdown, shipment, notes,
timeline, cancellation, and refund data.

### `PATCH /admin/orders/:id/status`

Request:

```json
{
  "status": "processing",
  "message": "Order approved for packing."
}
```

### `POST /admin/orders/:id/shipment`
### `PATCH /admin/orders/:id/shipment`
### `PATCH /admin/orders/:id/shipment/status`

Shipment request fields:

| Field | Description |
|---|---|
| `courier` | Courier name |
| `trackingNumber` | Courier tracking/reference number |
| `status` | Flexible shipment status |
| `shippedAt` | ISO date |
| `estimatedDeliveryAt` | ISO date |

At least one field must be provided. A saved shipment must contain both
`courier` and `trackingNumber`.

Example:

```json
{
  "courier": "Delhivery",
  "trackingNumber": "DEL123456789",
  "status": "in_transit",
  "estimatedDeliveryAt": "2026-11-02T00:00:00.000Z"
}
```

### `POST /admin/orders/:id/notes`

```json
{
  "message": "Customer requested careful packaging."
}
```

### `GET /admin/orders/:id/notes`

Returns the order detail response, including the `notes` and `timeline` arrays.

### `POST /admin/orders/:id/cancel`

```json
{
  "reason": "Customer cancellation request",
  "refund": {
    "amount": 1250,
    "status": "requested",
    "reference": "REF-EXAMPLE-001"
  }
}
```

Refund status values are `requested`, `processed`, and `not_required`.
Cancellation releases active stock reservations using the same checkout
reservation-release logic. This endpoint records refund metadata; it does not
call a payment provider.

### `GET /admin/orders/:id/invoice`

Returns:

```json
{
  "success": true,
  "data": {
    "order": {},
    "invoice": {
      "invoiceNumber": "TGS-2026-27-000001",
      "legalBusinessName": "TGSCO Textiles Private Limited"
    }
  }
}
```

If the order has no invoice number, this endpoint finalizes it by atomically
allocating and incrementing the active invoice settings sequence. Existing
invoice numbers are preserved.

### `POST /admin/orders/:id/refunds`

Creates a full or partial Razorpay refund. The payment must be captured, the
amount must be positive, and it cannot exceed the captured amount less existing
non-failed refunds. Send an `Idempotency-Key` header.

```json
{
  "amount": 100,
  "reason": "Customer-approved partial refund",
  "notes": { "supportTicket": "SUP-1001" }
}
```

The amount is validated and converted to paise server-side. The response is
the local refund record containing its Razorpay ID, payment ID, amount,
currency, status, timestamps, reason, notes, and failure details when
applicable.

### `GET /admin/orders/:id/refunds/:refundId`

Fetches the refund from Razorpay using server credentials, reconciles the local
refund record, and returns the updated record. The refund must already belong
to the specified order.

## Order, payment, and shipment statuses

Order statuses:

- `pending_payment`
- `confirmed`
- `processing`
- `shipped`
- `delivered`
- `returned`
- `cancelled`
- `refunded`

Valid order transitions:

```text
pending_payment -> confirmed, cancelled
confirmed       -> processing, cancelled
processing      -> shipped, cancelled
shipped         -> delivered, returned
delivered       -> returned
returned        -> refunded
cancelled       -> refunded
```

Payment statuses:

- `pending`
- `created`
- `authorized`
- `captured`
- `failed`
- `refunded`

Shipment status is stored as a flexible string. Common values are
`label_created`, `in_transit`, `out_for_delivery`, `delivered`, and `returned`;
the API does not enforce a shipment transition graph.

## Settings

### `GET /admin/settings`

Returns:

```json
{
  "invoice": [],
  "charges": []
}
```

### `GET /admin/settings/metadata`

Returns the same status and dynamic order-derived metadata as the order filters
endpoint.

### Invoice settings

#### `GET /admin/settings/invoice`
#### `PUT /admin/settings/invoice`

The GET returns an array of invoice settings. The PUT creates or updates the
default invoice settings record.

Supported fields:

- `legalBusinessName` (required)
- `displayBusinessName`
- `sellerAddress` (required): `line1`, `line2`, `city`, `state`, `postalCode`, `country`
- `gstin`
- `pan`
- `contact`
- `invoicePrefix`
- `financialYear` in `YYYY-YY` format
- `nextSequence`
- `terms`
- `returnsPolicy`
- `signatory`
- `bankDetails`
- `active`

The seller address postal code must be a six-digit Indian PIN. GSTIN and PAN
are validated when supplied.

### Shipping and packing charges

#### Shipping

- `GET /admin/settings/shipping`
- `POST /admin/settings/shipping`
- `PATCH /admin/settings/shipping/:id`
- `DELETE /admin/settings/shipping/:id`

#### Packing

- `GET /admin/settings/packing`
- `POST /admin/settings/packing`
- `PATCH /admin/settings/packing/:id`
- `DELETE /admin/settings/packing/:id`

Charge fields:

| Field | Description |
|---|---|
| `type` | `shipping` or `packing` |
| `code` | Unique lowercase code, 2–50 characters |
| `name` | Human-readable charge name |
| `method` | `flat` or `percentage` |
| `amount` | Required for flat rules |
| `percentage` | Required for percentage rules, 0–100 |
| `freeAbove` | Optional subtotal threshold |
| `taxable` | Whether tax applies |
| `taxRate` | 0–100; requires `taxable: true` when nonzero |
| `active` | Whether checkout uses the rule |
| `conditions` | Optional configuration metadata |

DELETE archives/deactivates a charge rather than physically deleting it.

Generic charge aliases are also available:

- `POST /admin/settings/charges`
- `PATCH /admin/settings/charges/:id`
- `DELETE /admin/settings/charges/:id`

Generic requests must include `type`.

Checkout reads active rules, calculates shipping, packing, COD, and tax
amounts, and snapshots applied charges and seller settings onto the order.
Taxable components include taxable amount, tax rate, tax amount, CGST, SGST,
and IGST.

## Errors

The repository error handler returns:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CHARGE_RULE",
    "message": "The charge rule is invalid.",
    "details": [
      {
        "field": "amount",
        "message": "A flat charge requires amount."
      }
    ]
  },
  "requestId": "request-id"
}
```

Important stable codes include:

| Code | Meaning |
|---|---|
| `INVALID_ORDER_FILTERS` | Invalid search, date, sort, or pagination values |
| `INVALID_ORDER_ID` | Malformed MongoDB order ID |
| `ORDER_NOT_FOUND` | Well-formed order ID does not exist |
| `INVALID_ORDER_STATUS_REQUEST` | Invalid status request body |
| `INVALID_ORDER_TRANSITION` | Requested status transition is not allowed |
| `INVALID_SHIPMENT_REQUEST` | Shipment request validation failed |
| `INCOMPLETE_SHIPMENT_DETAILS` | Courier or tracking number is missing |
| `INVALID_CANCELLATION_REQUEST` | Cancellation/refund body is invalid |
| `INVALID_REFUND_AMOUNT` | Refund exceeds order total |
| `INVALID_INVOICE_SETTINGS` | Seller/invoice fields failed validation |
| `INVOICE_SETTINGS_NOT_CONFIGURED` | No active invoice settings exist |
| `INVALID_CHARGE_RULE` | Charge rule failed validation |
| `DUPLICATE_CHARGE_SETTING` | Charge type/code already exists |
| `CHARGE_SETTING_NOT_FOUND` | Charge ID does not exist |
| `CHARGE_CALCULATION_FAILED` | Active checkout charge configuration could not be calculated |
| `INVALID_REFUND_REQUEST` | Refund body validation failed |
| `REFUND_IDEMPOTENCY_KEY_REQUIRED` | Refund creation requires an idempotency key |
| `REFUND_PAYMENT_NOT_CAPTURED` | The order has no captured Razorpay payment |
| `REFUND_AMOUNT_EXCEEDED` | Requested amount exceeds the remaining refundable amount |
| `REFUND_PROVIDER_NOT_CONFIGURED` | Razorpay refund credentials are unavailable |
| `REFUND_PROVIDER_ERROR` | Razorpay rejected or could not complete the request |
| `REFUND_NOT_FOUND` | Refund is not associated with the order |
| `REFUND_NOT_FOUND_AT_PROVIDER` | Razorpay no longer has the refund |

Malformed JSON, authentication failures, database validation failures, and
unexpected failures use the repository's standard error-handler conventions.

## Frontend integration flow

1. Call Admin Login and store `data.accessToken` as `admin_token`.
2. Load `/admin/orders/filters` to populate status, payment, courier, currency,
   and amount/date filter controls.
3. Request `/admin/orders` with URL-encoded query parameters.
4. Store an order `_id` as `order_id` when opening an order.
5. Use detail, status, shipment, notes, cancellation, and invoice endpoints
   for order management.
6. Load invoice, shipping, and packing settings during settings initialization.
7. Save charge IDs returned by successful requests and use them for PATCH or
   DELETE operations.
8. Treat invoice data as structured data for frontend rendering or a future
   document service.
9. Display `error.message` and field-level `error.details` rather than exposing
   server/debug information.

## Limitations

- Invoice data is returned as JSON; no PDF generation/download endpoint exists.
- Invoice sequence allocation can leave a gap if allocation succeeds but order
  finalization fails.
- Invoice financial-year values are configured by administrators; the API does
  not automatically roll the year over.
- Shipment statuses are flexible strings and have no enforced transition graph.
- Courier integrations and shipment webhooks are not implemented.
- Cancellation records refund metadata but does not execute an external refund.
- Dynamic filter values are derived from stored orders and are not cached.
- Tax jurisdiction compares seller and delivery state names; formal GST state
  code normalization is not performed.
- Charge `conditions` are stored metadata and are not interpreted beyond the
  configured flat, percentage, and free-above rules.
- Refund creation depends on Razorpay availability; local records are updated
  by the verified webhook or reconciliation endpoint.
