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

## Response envelopes

Every successful admin endpoint returns an HTTP 2xx response with this
envelope (the status code is `201` for note creation, refund creation, and
new charge creation):

```json
{
  "success": true,
  "data": {}
}
```

`data` is the resource or aggregate described below. Dates are serialized as
ISO-8601 strings and MongoDB `ObjectId` values are serialized as 24-character
hexadecimal strings. Errors use HTTP status codes and this envelope:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ORDER_FILTERS",
    "message": "Order filters are invalid.",
    "details": [{ "field": "limit", "message": "Limit must be a whole number from 1 to 100." }]
  },
  "requestId": "request-id"
}
```

`error.details` is omitted when there is no structured detail. Development
responses can additionally contain `debug.message` for an internal error;
frontends must not depend on that field.

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

| Parameter       | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `search`        | Searches order number, recipient name, or recipient mobile |
| `status`        | Exact order status                                         |
| `paymentStatus` | Exact payment status                                       |
| `from`          | Inclusive valid date                                       |
| `to`            | Inclusive valid date                                       |
| `sort`          | `newest` (default), `oldest`, or `total`                   |
| `page`          | Positive page number, default `1`                          |
| `limit`         | `1`–`100`, default `20`                                    |

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

The `items` array contains complete order documents (the list query does not
project a reduced DTO). A list item has `_id`, `createdAt`, and `updatedAt`,
plus these order fields:

| Field                                                                                          | Type/values          | Description                           |
| ---------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------- |
| `orderNumber`                                                                                  | string               | Human-readable unique order number    |
| `user`                                                                                         | ObjectId string      | Customer/user ID                      |
| `items`                                                                                        | order item[]         | Product snapshots and quantities      |
| `shippingAddress`, `billingAddress`                                                            | address snapshot     | Immutable checkout snapshots          |
| `subtotal`, `shippingFee`, `taxAmount`, `discountAmount`, `packingFee`, `codFee`, `grandTotal` | number               | Monetary values in `currency`         |
| `currency`                                                                                     | string               | Defaults to `INR`                     |
| `paymentMethod`                                                                                | `cod` or `razorpay`  | Checkout payment method               |
| `orderStatus`                                                                                  | order status         | Current fulfilment state              |
| `paymentStatus`                                                                                | payment status       | Current payment state                 |
| `razorpayOrderId`, `razorpayPaymentId`                                                         | string, optional     | Provider identifiers                  |
| `reservationExpiresAt`                                                                         | ISO date, optional   | Reservation expiry                    |
| `reservations`                                                                                 | reservation[]        | Inventory reservations                |
| `shipment`                                                                                     | object or null       | Flexible shipment snapshot            |
| `notes`, `timeline`                                                                            | string[], timeline[] | Admin notes and events                |
| `cancellation`, `refund`                                                                       | object or null       | Cancellation/refund metadata          |
| `refunds`                                                                                      | refund[]             | Provider refund records               |
| `refundedAmount`                                                                               | number               | Amount currently refunded/in progress |

Pagination is `{ items, total, page, limit, pages }`; `pages` is
`Math.ceil(total / limit)` and is `0` when there are no results.

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

The filter metadata schema is `orderStatuses[]`, `paymentStatuses[]`,
`chargeTypes[]` (currently `shipping` and `packing`), `couriers[]`,
`currencies[]`, and `totals`. `totals` contains `min`, `max`, `earliest`, and
`latest` when orders exist; it is `{}` when the aggregation has no result.
The status arrays include the implementation's known values even when no
matching order currently exists. `status` and `paymentStatus` query filters
are passed through as strings (the endpoint does not restrict them to the
metadata arrays).

### `GET /admin/orders/:id`

Returns the complete order document, including product IDs, address snapshots,
seller/invoice snapshot, applied charges, tax breakdown, shipment, notes,
timeline, cancellation, and refund data.

#### Order detail schema

The detail response is `{ "success": true, "data": <order> }`. In addition
to `_id`, `createdAt`, and `updatedAt`, `<order>` has the following exact
fields:

| Group               | Fields                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity/customer   | `orderNumber`, `user`, `idempotencyKey`                                                                    |
| Totals              | `subtotal`, `shippingFee`, `packingFee`, `codFee`, `taxAmount`, `discountAmount`, `grandTotal`, `currency` |
| Payment             | `paymentMethod`, `paymentStatus`, `razorpayOrderId`, `razorpayPaymentId`                                   |
| Reservation         | `reservationExpiresAt`, `reservations`, `processedWebhookEvents`                                           |
| Snapshots           | `items`, `shippingAddress`, `billingAddress`, `sellerSnapshot`, `invoiceSnapshot`, `invoiceNumber`         |
| Charges/tax         | `appliedCharges`, `taxBreakdown`                                                                           |
| Fulfilment/activity | `orderStatus`, `shipment`, `notes`, `timeline`                                                             |
| Resolution          | `cancellation`, `refund`, `refunds`, `refundedAmount`                                                      |

`user` is the referenced user ID (it is not populated by this controller).
The admin order endpoints do not add a separate `payment` object; payment
information is represented by the order's `paymentMethod`, `paymentStatus`,
`razorpayOrderId`, and `razorpayPaymentId` fields. (Checkout responses may
include a transient `payment` object, which is outside this admin schema.)
`items` are checkout-time snapshots:

```json
{
  "productId": "671234567890abcdef123456",
  "sku": "FAB-001",
  "name": "Cotton Fabric",
  "slug": "cotton-fabric",
  "mainImage": { "url": "https://cdn.example.test/fab-001.jpg" },
  "quantity": 2,
  "unitPrice": 625,
  "lineTotal": 1250,
  "currency": "INR"
}
```

Each address snapshot has `addressId`, `label`, `recipientName`, `mobile`,
`alternateMobile`, `addressLine1`, `addressLine2`, `locality`, `landmark`,
`city`, `district`, `state`, `stateCode`, `postalCode`, `country`, and
`deliveryInstructions`. Optional values may be absent or null depending on
the stored document.

`reservations[]` has `productId`, `quantity`, and `status` (`active`,
`consumed`, or `released`). `appliedCharges[]` has `code`, `name`, `amount`,
`taxRate`, and `taxable` when created from the order model; checkout-created
charge snapshots additionally contain `taxableAmount`, `taxAmount`, `cgst`,
and `igst` (and `sgst` for intra-state tax). `taxBreakdown` is the checkout
tax component array/object and is intentionally not normalized by the API.
`sellerSnapshot` and `invoiceSnapshot` are intentionally flexible objects.

`shipment` is a flexible object populated by the shipment endpoint and
normally contains `courier`, `trackingNumber`, `status`, `shippedAt`, and
`estimatedDeliveryAt`. `timeline[]` entries contain `type`, `message`, `by`,
and `createdAt`; `by` is the admin user ID. `cancellation` is flexible
metadata (the admin cancellation service writes `reason`, `by`, and `at`).
`notes` is an array of strings.

Example (abridged only for long snapshot values):

```json
{
  "success": true,
  "data": {
    "_id": "671234567890abcdef123456",
    "orderNumber": "TGS-2026-000123",
    "user": "671234567890abcdef654321",
    "subtotal": 1250,
    "shippingFee": 80,
    "packingFee": 20,
    "codFee": 0,
    "taxAmount": 243,
    "discountAmount": 50,
    "grandTotal": 1543,
    "currency": "INR",
    "paymentMethod": "razorpay",
    "paymentStatus": "captured",
    "orderStatus": "processing",
    "items": [],
    "shippingAddress": {},
    "billingAddress": {},
    "sellerSnapshot": {},
    "invoiceSnapshot": null,
    "appliedCharges": [],
    "taxBreakdown": [],
    "shipment": null,
    "notes": ["Customer requested careful packaging."],
    "timeline": [],
    "cancellation": null,
    "refund": null,
    "refunds": [],
    "refundedAmount": 0,
    "createdAt": "2026-10-26T06:18:00.000Z",
    "updatedAt": "2026-10-26T06:20:00.000Z"
  }
}
```

### `PATCH /admin/orders/:id/status`

Request:

```json
{
  "status": "processing",
  "message": "Order approved for packing."
}
```

The response is the updated complete order document in the common success
envelope. The service appends a `timeline` entry with `type: "status"`,
the supplied (or generated) `message`, `by`, and `createdAt`. The requested
status must be an allowed transition; the response includes the new
`orderStatus`.

### `POST /admin/orders/:id/shipment`

### `PATCH /admin/orders/:id/shipment`

### `PATCH /admin/orders/:id/shipment/status`

Shipment request fields:

| Field                 | Description                       |
| --------------------- | --------------------------------- |
| `courier`             | Courier name                      |
| `trackingNumber`      | Courier tracking/reference number |
| `status`              | Flexible shipment status          |
| `shippedAt`           | ISO date                          |
| `estimatedDeliveryAt` | ISO date                          |

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

All three shipment routes return the updated complete order document. The
service merges supplied fields into the existing `shipment` object, so an
update does not clear omitted fields, and appends a `type: "shipment"`
timeline entry. The response's shipment object uses exactly the fields
`courier`, `trackingNumber`, `status`, `shippedAt`, and
`estimatedDeliveryAt` when present. `POST`, `PATCH`, and the status route
are aliases with the same response behavior.

### `POST /admin/orders/:id/notes`

```json
{
  "message": "Customer requested careful packaging."
}
```

Returns the updated complete order document with the new string in `notes`
and a `timeline` entry whose `type` is `note`.

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

The response is the updated complete order document. It sets
`orderStatus: "cancelled"`, stores `cancellation: { reason, by, at }`,
changes active reservation statuses to `released`, optionally stores the
request's `refund` object, and appends a `type: "cancellation"` timeline
entry.

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

The invoice response is `{ order, invoice }`. `order` is the complete order
document. `invoice` contains the invoice settings snapshot plus
`invoiceNumber`; invoice settings fields are `key`, `active`, `archivedAt`,
`legalBusinessName`, `displayBusinessName`, `sellerAddress`, `gstin`, `pan`,
`contact`, `invoicePrefix`, `financialYear`, `nextSequence`, `terms`,
`returnsPolicy`, `signatory`, `bankDetails`, `createdAt`, and `updatedAt`.
`sellerAddress` uses `line1`, `line2`, `city`, `state`, `postalCode`, and
`country` (the settings request validation requires `line1`, `city`, `state`,
and a six-digit `postalCode`).

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

The refund response object has `refundId`, `paymentId`, `amount` (major
currency units), `currency`, `status` (`created`, `processed`, `failed`, or
`pending`), `reason`, `notes`, `idempotencyKey`, `createdAt`, `processedAt`,
and `failure`. `failure` is null or an object containing provider failure
details such as `reason`, `description`, and `code`. A repeated
`Idempotency-Key` returns the existing local refund record.

### `GET /admin/orders/:id/refunds/:refundId`

Fetches the refund from Razorpay using server credentials, reconciles the local
refund record, and returns the updated record. The refund must already belong
to the specified order.

The reconcile response is the same refund object. Reconciliation can update
`amount`, `currency`, `status`, `createdAt`, `processedAt`, `notes`, and
`failure`, and updates the order's `refunds`, `refund`, and `refundedAmount`
fields. A fully processed refund can also set order and payment status to
`refunded`.

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

The settings aggregate is exactly `{ invoice, charges }`, where both values
are arrays. `invoice[]` contains invoice settings documents and `charges[]`
contains charge settings documents. Supplying `?type=invoice` returns the
invoice array; supplying any other `type` returns the charge array for that
type. The dedicated `/invoice`, `/shipping`, and `/packing` routes are
preferred because their response type is unambiguous.

### `GET /admin/settings/metadata`

Returns the same status and dynamic order-derived metadata as the order filters
endpoint.

The metadata response has the exact shape
`{ orderStatuses, paymentStatuses, chargeTypes, couriers, currencies, totals }`
documented for `/admin/orders/filters`; it is not settings-document metadata.

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

Successful PUT and GET responses contain an invoice settings object with the
stored fields:

| Field                                                | Description                                            |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `key`                                                | Settings key; the upserted record is `default`         |
| `active`, `archivedAt`                               | Activation/archive metadata                            |
| `legalBusinessName`, `displayBusinessName`           | Seller names                                           |
| `sellerAddress`                                      | Mixed object using the validated seller address fields |
| `gstin`, `pan`, `contact`                            | Tax and contact metadata                               |
| `invoicePrefix`, `financialYear`, `nextSequence`     | Numbering configuration                                |
| `terms`, `returnsPolicy`, `signatory`, `bankDetails` | Invoice presentation/payment metadata                  |
| `createdAt`, `updatedAt`                             | Mongoose timestamps                                    |

`contact`, `signatory`, and `bankDetails` are arbitrary JSON objects. The
response may also include Mongoose version metadata; clients should ignore
unknown fields.

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

| Field        | Description                                  |
| ------------ | -------------------------------------------- |
| `type`       | `shipping` or `packing`                      |
| `code`       | Unique lowercase code, 2–50 characters       |
| `name`       | Human-readable charge name                   |
| `method`     | `flat` or `percentage`                       |
| `amount`     | Required for flat rules                      |
| `percentage` | Required for percentage rules, 0–100         |
| `freeAbove`  | Optional subtotal threshold                  |
| `taxable`    | Whether tax applies                          |
| `taxRate`    | 0–100; requires `taxable: true` when nonzero |
| `active`     | Whether checkout uses the rule               |
| `conditions` | Optional configuration metadata              |

DELETE archives/deactivates a charge rather than physically deleting it.

Each successful shipping, packing, or generic charge create/update/delete
response returns the charge object (inside `data`), not a wrapper. Its stored
fields are:

| Field                    | Description                                |
| ------------------------ | ------------------------------------------ |
| `_id`                    | Charge setting ID used by PATCH/DELETE     |
| `type`                   | `shipping` or `packing`                    |
| `code`, `name`           | Unique machine code and display name       |
| `active`, `archivedAt`   | Activation/archive metadata                |
| `method`                 | `flat` or `percentage`                     |
| `amount`                 | Flat amount (defaults to `0`)              |
| `percentage`             | Percentage amount (defaults to `0`)        |
| `freeAbove`              | Optional subtotal threshold                |
| `taxable`, `taxRate`     | Tax behavior                               |
| `conditions`             | Arbitrary JSON metadata (defaults to `{}`) |
| `createdAt`, `updatedAt` | Mongoose timestamps                        |

Example:

```json
{
  "success": true,
  "data": {
    "_id": "671234567890abcdef123457",
    "type": "shipping",
    "code": "standard_shipping",
    "name": "Standard shipping",
    "active": true,
    "method": "flat",
    "amount": 80,
    "percentage": 0,
    "freeAbove": 2000,
    "taxable": true,
    "taxRate": 18,
    "conditions": {},
    "createdAt": "2026-10-26T06:00:00.000Z",
    "updatedAt": "2026-10-26T06:00:00.000Z"
  }
}
```

The same object shape is used for packing charges and generic
`/settings/charges` requests. Generic create/update requests must include
`type`; route-specific shipping and packing handlers inject it. DELETE
returns the updated object with `active: false` and `archivedAt` set.

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

| Code                              | Meaning                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `INVALID_ORDER_FILTERS`           | Invalid search, date, sort, or pagination values             |
| `INVALID_ORDER_ID`                | Malformed MongoDB order ID                                   |
| `ORDER_NOT_FOUND`                 | Well-formed order ID does not exist                          |
| `INVALID_ORDER_STATUS_REQUEST`    | Invalid status request body                                  |
| `INVALID_ORDER_TRANSITION`        | Requested status transition is not allowed                   |
| `INVALID_SHIPMENT_REQUEST`        | Shipment request validation failed                           |
| `INCOMPLETE_SHIPMENT_DETAILS`     | Courier or tracking number is missing                        |
| `INVALID_CANCELLATION_REQUEST`    | Cancellation/refund body is invalid                          |
| `INVALID_REFUND_AMOUNT`           | Refund exceeds order total                                   |
| `INVALID_INVOICE_SETTINGS`        | Seller/invoice fields failed validation                      |
| `INVOICE_SETTINGS_NOT_CONFIGURED` | No active invoice settings exist                             |
| `INVALID_CHARGE_RULE`             | Charge rule failed validation                                |
| `DUPLICATE_CHARGE_SETTING`        | Charge type/code already exists                              |
| `CHARGE_SETTING_NOT_FOUND`        | Charge ID does not exist                                     |
| `CHARGE_CALCULATION_FAILED`       | Active checkout charge configuration could not be calculated |
| `INVALID_REFUND_REQUEST`          | Refund body validation failed                                |
| `REFUND_IDEMPOTENCY_KEY_REQUIRED` | Refund creation requires an idempotency key                  |
| `REFUND_PAYMENT_NOT_CAPTURED`     | The order has no captured Razorpay payment                   |
| `REFUND_AMOUNT_EXCEEDED`          | Requested amount exceeds the remaining refundable amount     |
| `REFUND_PROVIDER_NOT_CONFIGURED`  | Razorpay refund credentials are unavailable                  |
| `REFUND_PROVIDER_ERROR`           | Razorpay rejected or could not complete the request          |
| `REFUND_NOT_FOUND`                | Refund is not associated with the order                      |
| `REFUND_NOT_FOUND_AT_PROVIDER`    | Razorpay no longer has the refund                            |

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
