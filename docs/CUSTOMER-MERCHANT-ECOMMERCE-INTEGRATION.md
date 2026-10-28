# Customer and Merchant E-commerce Integration

This is the frontend contract for the currently implemented cart, wishlist,
address, checkout, payment, and order APIs. The API is mounted at
`/api/v1`; examples below show the complete path. Authentication and Product
Catalogue are deliberately not documented here. Every endpoint in this
document requires an access token unless explicitly marked **public**.

For administrator order, shipment, charge, invoice, and refund operations see
[ADMIN-ORDERS-SETTINGS-INTEGRATION.md](./ADMIN-ORDERS-SETTINGS-INTEGRATION.md).
Those endpoints are out of scope for customer and merchant applications.

## Conventions

Send `Authorization: Bearer <access-token>` and `Content-Type: application/json`.
The token must represent a `customer` or `merchant`; admin tokens are rejected
with `ECOMMERCE_USER_ACCESS_REQUIRED`. Amounts are decimal INR (or the product
currency) values in API responses. Razorpay's `payment.amount` is the integer
minor-unit amount (paise).

Successful responses always have this envelope:

```json
{ "success": true, "data": {} }
```

Create operations return `201`; other successful operations return `200`.
Errors have this shape (the `details` and development-only `debug` properties
are optional):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted information and correct the highlighted fields.",
    "details": [{ "field": "quantity", "message": "Too small: expected number to be >0" }]
  },
  "requestId": "req_abc123"
}
```

Common statuses are `400` malformed/invalid input, `401` missing/expired
token, `403` wrong account type, `404` resource not owned or not found,
`409` stock/state/conflict, `429` rate limit, `502` payment-provider failure,
and `503` missing provider/configuration. The server applies a 100-request
per-15-minute rate limit. There is no pagination query parameter currently:
cart, wishlist, addresses, and order list return complete arrays.

## Cancellation and returns

`POST /api/v1/checkout/orders/:id/cancel` is available to the owning customer
or merchant. Cancellation is allowed through the configured
`cancellationAllowedUntil` status (default `shipped`). Active stock
reservations are released. Captured Razorpay payments create a server-side
refund and remain pending until the Razorpay webhook/reconciliation confirms
the final payment and order status. When a linked Razorpay refund reaches
`processed` (or the provider reports `refunded`), the return is completed
automatically; no manual return PATCH is required. COD cancellations never
call Razorpay and return a `manual_pending` refund record where money is due.

Returns use immutable order item snapshots:

- `POST /api/v1/orders/:id/returns` body
  `{ "items": [{ "productId": "...", "quantity": 1 }], "reason": "...", "customerNote": "..." }`
- `GET /api/v1/orders/:id/returns` and `GET /api/v1/returns`
- `POST /api/v1/returns/:returnId/cancel`

Only delivered orders within the configured `returnWindowDays` (default 7)
are eligible. Product IDs must belong to the order; quantities cannot exceed
the purchased quantity or prior non-cancelled return requests. Return statuses
are `requested`, `approved`, `rejected`, `pickup_pending`, `received`,
`inspection_pending`, `approved_for_refund`, `refund_pending`, `refunded`,
`completed`, and `cancelled`.

## Cart

All cart routes are under `/api/v1/cart`. The server creates one cart per
authenticated user. Cart item quantities are positive integers and product IDs
must be 24-character hexadecimal MongoDB IDs.

| Method   | Path                            | Body                                                              | Result                                |
| -------- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `GET`    | `/api/v1/cart`                  | —                                                                 | Current cart                          |
| `POST`   | `/api/v1/cart/items`            | `{ "productId": string, "quantity": integer > 0 }`                | Adds to existing quantity             |
| `PATCH`  | `/api/v1/cart/items/:productId` | `{ "quantity": integer > 0 }`                                     | Replaces quantity                     |
| `DELETE` | `/api/v1/cart/items/:productId` | —                                                                 | Removes item                          |
| `DELETE` | `/api/v1/cart`                  | —                                                                 | Clears all items                      |
| `POST`   | `/api/v1/cart/merge`            | `{ "items": [{ "productId": string, "quantity": integer > 0 }] }` | Adds guest quantities to account cart |

Cart data has this exact shape:

```json
{
  "success": true,
  "data": {
    "id": "66a000000000000000000001",
    "items": [
      {
        "product": "66a000000000000000000101",
        "name": "Organic Wheat",
        "slug": "organic-wheat",
        "mainImage": { "url": "https://cdn.example/wheat.jpg", "alt": "Wheat" },
        "quantity": 3,
        "unitPrice": 240,
        "lineTotal": 720,
        "currency": "INR"
      }
    ],
    "totalItems": 3,
    "subtotal": 720,
    "currency": "INR"
  }
}
```

`unitPrice` is the customer product price. For a merchant it is the matching
configured bulk tier price. A merchant must have a quantity covered by
`bulkPricing.minimumQuantity`/`maximumQuantity`; otherwise the operation (or
even reading the cart) returns `409 BULK_QUANTITY_REQUIRED`. Exceeding current
stock returns `409 INSUFFICIENT_STOCK`; inactive/missing products return
`404 PRODUCT_NOT_FOUND` (merge uses `409 CART_PRODUCT_UNAVAILABLE`), and
updating/removing an absent item returns `404 CART_ITEM_NOT_FOUND`.

### Guest cart merge

Guest carts are frontend-only; no unauthenticated cart route exists. Store
quantities keyed by product ID in local storage, then after login:

1. Keep the guest snapshot while obtaining the new access token.
2. `POST /api/v1/cart/merge` with all guest entries. The service combines
   duplicate guest IDs and adds them to server quantities. For merchant users,
   an invalid quantity is automatically raised to the next configured bulk-tier
   minimum when one exists. The response includes an `adjustments` array so the
   frontend can notify the merchant of each quantity increase. If no higher
   tier exists, or the adjusted quantity exceeds stock, the merge is rejected.
3. Replace the client cart with the returned `data`, and only then delete the
   local guest cart. On `409`, keep local data and show the returned conflict.
4. `GET /api/v1/cart` on subsequent page loads.

For example, a merge response may include:

```json
{
  "items": [],
  "adjustments": [
    {
      "productId": "64f000000000000000000001",
      "productName": "Pochampally Ikat Silk Sarees",
      "requestedQuantity": 1,
      "adjustedQuantity": 10,
      "reason": "MERCHANT_BULK_MINIMUM"
    }
  ]
}
```

The backend never silently reduces quantities. It only raises an invalid
merchant quantity to the next eligible bulk minimum. A quantity that already
matches a tier is unchanged.

## Wishlist

All routes require a customer or merchant token. Wishlist entries contain
products, not quantities.

| Method   | Path                                | Body                              |
| -------- | ----------------------------------- | --------------------------------- |
| `GET`    | `/api/v1/wishlist`                  | —                                 |
| `POST`   | `/api/v1/wishlist/items`            | `{ "productId": string }`         |
| `DELETE` | `/api/v1/wishlist/items/:productId` | —                                 |
| `DELETE` | `/api/v1/wishlist`                  | —                                 |
| `POST`   | `/api/v1/wishlist/merge`            | `{ "productIds": [string, ...] }` |

The normal response is:

```json
{
  "success": true,
  "data": {
    "id": "66a000000000000000000002",
    "items": [
      {
        "product": "66a000000000000000000101",
        "name": "Organic Wheat",
        "slug": "organic-wheat",
        "sku": "WHEAT-001",
        "mainImage": { "url": "https://cdn.example/wheat.jpg" },
        "price": 240,
        "currency": "INR",
        "stockQuantity": 24,
        "active": true
      }
    ]
  }
}
```

Adding an existing item is idempotent and returns the unchanged list.
`PRODUCT_NOT_FOUND` is `404`; removing an absent item is
`404 WISHLIST_ITEM_NOT_FOUND`. Merge de-duplicates IDs, ignores inactive or
missing IDs, and reports them rather than failing:

```json
{
  "success": true,
  "data": { "id": "...", "items": [], "unavailableProductIds": ["66a000000000000000000199"] }
}
```

For guest merge use the same four-step sequence as cart, storing a unique
product-ID array locally. Do not remove local IDs until the merge succeeds.

## Addresses

Address endpoints are `/api/v1/addresses`. Every address is owned by the
token's user; an ID belonging to another user is indistinguishable from a
missing ID and returns `404 ADDRESS_NOT_FOUND`.

### Fields and validation

Create (`POST /api/v1/addresses`) accepts:

```json
{
  "label": "home",
  "recipientName": "Asha Rao",
  "mobile": "+919876543210",
  "alternateMobile": "9876543210",
  "addressLine1": "12 Market Road",
  "addressLine2": "Flat 4B",
  "locality": "Indiranagar",
  "landmark": "Near Metro",
  "city": "Bengaluru",
  "district": "Bengaluru Urban",
  "state": "Karnataka",
  "stateCode": "KA",
  "postalCode": "560038",
  "country": "India",
  "deliveryInstructions": "Call on arrival",
  "isDefault": true
}
```

`label` is `home`, `work`, or `other` (default `home`). `recipientName` is
2–100 trimmed characters; address line 1 is 3–200; line 2 is optional and
max 200; locality is 2–100; landmark max 150; city and state are 2–100;
district max 100; stateCode max 3; delivery instructions max 300.
`mobile` and optional `alternateMobile` must match the Indian mobile format
`+91` (optional separator) followed by 10 digits beginning 6–9. `postalCode`
must be exactly six digits. `country` defaults to `India`; `isDefault`
defaults to false. Empty PATCH bodies are invalid.

Routes:

| Method   | Path                            | Body/result                                      |
| -------- | ------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/v1/addresses`             | Array, newest first with default addresses first |
| `POST`   | `/api/v1/addresses`             | `201`, created address                           |
| `GET`    | `/api/v1/addresses/:id`         | Address                                          |
| `PATCH`  | `/api/v1/addresses/:id`         | Any non-empty subset of create fields            |
| `PATCH`  | `/api/v1/addresses/:id/default` | `{}`; makes it default                           |
| `DELETE` | `/api/v1/addresses/:id`         | `{ "deleted": true, "addressId": string }`       |

Update an address with `PATCH /api/v1/addresses/:id`. The request may contain
any non-empty subset of the fields below; the complete form is:

```http
PATCH /api/v1/addresses/66a000000000000000000301
Authorization: Bearer <customer_token-or-merchant_token>
Content-Type: application/json
```

```json
{
  "label": "home",
  "recipientName": "Asha Rao",
  "mobile": "+919876543210",
  "alternateMobile": "9876543210",
  "addressLine1": "12 Market Road",
  "addressLine2": "Flat 4B",
  "locality": "Indiranagar",
  "landmark": "Near Metro",
  "city": "Bengaluru",
  "district": "Bengaluru Urban",
  "state": "Karnataka",
  "stateCode": "KA",
  "postalCode": "560038",
  "country": "India",
  "deliveryInstructions": "Call on arrival",
  "isDefault": true
}
```

The authenticated customer or merchant may update only their own address.
Setting `isDefault` to `true` unsets that user's previous default address.

Each address response includes Mongo timestamps and `user` in addition to the
fields above:

```json
{
  "_id": "66a000000000000000000301",
  "user": "66a000000000000000000010",
  "label": "home",
  "recipientName": "Asha Rao",
  "mobile": "+919876543210",
  "alternateMobile": null,
  "addressLine1": "12 Market Road",
  "addressLine2": "Flat 4B",
  "locality": "Indiranagar",
  "landmark": "Near Metro",
  "city": "Bengaluru",
  "district": "Bengaluru Urban",
  "state": "Karnataka",
  "stateCode": "KA",
  "postalCode": "560038",
  "country": "India",
  "deliveryInstructions": "Call on arrival",
  "isDefault": true,
  "createdAt": "2026-10-26T06:00:00.000Z",
  "updatedAt": "2026-10-26T06:00:00.000Z"
}
```

The first address automatically becomes default. Setting another default
unsets the previous one; deleting the default promotes the newest remaining
address. Checkout copies the selected address into immutable shipping and
billing **snapshots**, including `addressId`; later edits or deletion do not
rewrite historical orders.

## Checkout summary and order creation

`GET /api/v1/checkout/summary` requires a non-empty cart and returns a live
pre-checkout calculation. It includes `items[]` (`productId`, `sku`, `name`,
`slug`, `mainImage`, `quantity`, `availableQuantity`, `unitPrice`, `lineTotal`,
`currency`), `subtotal`, `shippingFee`, `packingFee`, `codFee`, `taxAmount`,
`taxBreakdown[]`, `discountAmount` (currently `0`), `grandTotal`, `currency`,
`canCheckout`, and `warnings[]`.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "66a000000000000000000101",
        "sku": "WHEAT-001",
        "name": "Organic Wheat",
        "slug": "organic-wheat",
        "mainImage": null,
        "quantity": 3,
        "availableQuantity": 24,
        "unitPrice": 240,
        "lineTotal": 720,
        "currency": "INR"
      }
    ],
    "subtotal": 720,
    "shippingFee": 40,
    "packingFee": 10,
    "codFee": 0,
    "taxAmount": 13.5,
    "taxBreakdown": [
      {
        "code": "shipping",
        "name": "Shipping GST",
        "taxableAmount": 40,
        "taxRate": 18,
        "taxAmount": 7.2,
        "cgst": 3.6,
        "sgst": 3.6,
        "igst": 0
      }
    ],
    "discountAmount": 0,
    "grandTotal": 783.5,
    "currency": "INR",
    "canCheckout": true,
    "warnings": []
  }
}
```

Warnings have `productId`, `type`, and where applicable `availableQuantity` or
`message`; types are `PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK`, and
`BULK_QUANTITY_REQUIRED`. Empty carts return `409 CART_EMPTY`; mixed product
currencies return `409 MIXED_CURRENCY_CART`.

Create an order with `POST /api/v1/checkout/orders`:

```json
{
  "shippingAddressId": "66a000000000000000000301",
  "billingAddressId": "66a000000000000000000302",
  "paymentMethod": "cod"
}
```

`billingAddressId` is optional and defaults to shipping. IDs must be valid
24-character IDs owned by the user. `paymentMethod` is exactly `cod` or
`razorpay`. Send a unique `Idempotency-Key` header for every checkout attempt.
Repeating the same key for the same user returns the original order, preventing
duplicate reservations/orders. The key is not a request-body field.

At creation, the server revalidates stock, active products, merchant tiers,
addresses, charges, and currency. It reserves stock (`reservedQuantity`) before
saving the order and clears the cart after a successful order/provider
creation. A failed operation releases reservations. COD must be enabled and
the subtotal must not exceed configured `COD_MAX_ORDER_VALUE` (default
₹50,000), otherwise `409 COD_NOT_AVAILABLE` or `COD_LIMIT_EXCEEDED`.
Revalidation conflicts return `409 CHECKOUT_REVALIDATION_FAILED` with warnings.

### COD response

COD orders are immediately `orderStatus: "confirmed"` and
`paymentStatus: "pending"`; no `payment` property is returned.

### Razorpay response and timing

Razorpay supports INR only (`409 UNSUPPORTED_PAYMENT_CURRENCY`). The order is
created as `pending_payment`/`created`, stock is reserved for the configured
payment window (15 minutes by default), and the response includes:

```json
{
  "success": true,
  "data": {
    "orderNumber": "TGS-1792994400000-4821",
    "paymentMethod": "razorpay",
    "orderStatus": "pending_payment",
    "paymentStatus": "created",
    "grandTotal": 783.5,
    "currency": "INR",
    "razorpayOrderId": "order_Rzp123",
    "payment": {
      "keyId": "rzp_test_abc",
      "orderId": "order_Rzp123",
      "amount": 78350,
      "currency": "INR"
    }
  }
}
```

Use `payment.orderId`, `payment.amount`, and `payment.currency` to launch the
Razorpay Checkout SDK; never calculate or trust the amount in the browser.
`PAYMENT_PROVIDER_NOT_CONFIGURED` is `503`, provider API failures are
`502 PAYMENT_PROVIDER_ERROR`.

## Razorpay verification and webhook behavior

After the Razorpay SDK succeeds, call
`POST /api/v1/checkout/payments/razorpay/verify`:

```json
{
  "orderId": "66a000000000000000000401",
  "razorpayOrderId": "order_Rzp123",
  "razorpayPaymentId": "pay_Rzp456",
  "razorpaySignature": "generated_signature"
}
```

All four values are required strings (order IDs are 24-character IDs).
The server checks ownership, that the Razorpay order matches, and the HMAC
SHA-256 signature over `razorpayOrderId|razorpayPaymentId`. Invalid signatures
return `400 INVALID_PAYMENT_SIGNATURE`; a mismatch/not-owned order is
`404 ORDER_NOT_FOUND`. Successful verification stores the payment ID and
returns the full order with `paymentStatus: "authorized"`. The authoritative
capture transition is still the verified Razorpay webhook.

**Public provider endpoint:** Razorpay calls
`POST /api/v1/checkout/payments/razorpay/webhook`; it has no bearer token.
The server requires the raw request body and `X-Razorpay-Signature`, validates
the HMAC with `RAZORPAY_WEBHOOK_SECRET`, parses JSON, and returns
`{ "success": true, "data": { "received": true } }`. Missing/invalid
signature/body/configuration is `400 INVALID_WEBHOOK` or
`INVALID_WEBHOOK_SIGNATURE`; invalid JSON is `400 INVALID_WEBHOOK_PAYLOAD`.
Unknown orders are acknowledged with `received: true`.

Handled customer-visible events:

- `payment.captured` and `order.paid` consume reservations (decrementing
  stock), set `paymentStatus: captured`, `orderStatus: confirmed`, save the
  payment ID, and clear the cart.
- `payment.failed` releases reservations and sets `paymentStatus: failed` and
  `orderStatus: cancelled`.
- `refund.created`, `refund.processed`, `refund.failed`, `refund.updated`, and
  `refund.speed_changed` update the order's refund fields.

Webhook event IDs are persisted, so duplicate deliveries are safely ignored.
Expired `created`/`authorized` Razorpay reservations are released by the
server's periodic job and the order becomes `failed`/`cancelled`.

## Orders

| Method | Path                                 | Result                                              |
| ------ | ------------------------------------ | --------------------------------------------------- |
| `GET`  | `/api/v1/checkout/orders`            | Current user's complete order array, newest first   |
| `GET`  | `/api/v1/checkout/orders/:id`        | Owned order detail                                  |
| `POST` | `/api/v1/checkout/orders/:id/cancel` | Cancel owned `pending_payment` or `confirmed` order |

The list and detail return the persisted order object. The exhaustive
customer-visible schema is:

- identity: `_id`, `orderNumber`, `user`, `idempotencyKey`;
- `items[]`: `productId`, `sku`, `name`, `slug`, `mainImage`, `quantity`,
  `unitPrice`, `lineTotal`, `currency`;
- `shippingAddress` and `billingAddress` snapshots: `addressId`, `label`,
  `recipientName`, `mobile`, `alternateMobile`, `addressLine1`,
  `addressLine2`, `locality`, `landmark`, `city`, `district`, `state`,
  `stateCode`, `postalCode`, `country`, `deliveryInstructions`;
- totals: `subtotal`, `shippingFee`, `taxAmount`, `discountAmount`,
  `packingFee`, `codFee`, `taxBreakdown`, `appliedCharges[]`, `grandTotal`,
  `currency`;
- payment/status: `paymentMethod`, `orderStatus`, `paymentStatus`,
  `razorpayOrderId`, `razorpayPaymentId`, `reservationExpiresAt`;
- fulfilment/audit: `reservations[]` (`productId`, `quantity`, `status`),
  `shipment`, `notes[]`, `timeline[]` (`type`, `message`, `by`, `createdAt`),
  `cancellation`, `sellerSnapshot`, `invoiceSnapshot`, `invoiceNumber`,
  `processedWebhookEvents`;
- refunds: `refund`, `refunds[]`, and `refundedAmount`;
- timestamps: `createdAt`, `updatedAt`.

`taxBreakdown` entries contain `code`, `name`, `taxableAmount`, `taxRate`,
`taxAmount`, `cgst`, `sgst`, and `igst`. Persisted `appliedCharges` entries
contain `code`, `name`, `amount`, `taxRate`, and `taxable` (some of these are
optional in the model and may be absent). Refund entries contain
`refundId`, `paymentId`, `amount`, `currency`, `status` (`created`,
`processed`, `failed`, or `pending`), `reason`, `notes`, `idempotencyKey`,
`createdAt`, `processedAt`, and `failure`. A failure can contain `reason`,
`description`, and `code`. `shipment`, snapshots, cancellation, and invoice
values are mixed objects and may be `null`; do not assume undocumented nested
properties.

Example detail (abbreviated only for readability; fields listed above remain
available):

```json
{
  "success": true,
  "data": {
    "_id": "66a000000000000000000401",
    "orderNumber": "TGS-1792994400000-4821",
    "user": "66a000000000000000000010",
    "items": [
      {
        "productId": "66a000000000000000000101",
        "sku": "WHEAT-001",
        "name": "Organic Wheat",
        "slug": "organic-wheat",
        "mainImage": null,
        "quantity": 3,
        "unitPrice": 240,
        "lineTotal": 720,
        "currency": "INR"
      }
    ],
    "subtotal": 720,
    "shippingFee": 40,
    "taxAmount": 13.5,
    "discountAmount": 0,
    "packingFee": 10,
    "codFee": 0,
    "grandTotal": 783.5,
    "currency": "INR",
    "paymentMethod": "cod",
    "orderStatus": "confirmed",
    "paymentStatus": "pending",
    "refund": null,
    "refunds": [],
    "refundedAmount": 0,
    "createdAt": "2026-10-26T06:00:00.000Z",
    "updatedAt": "2026-10-26T06:00:00.000Z"
  }
}
```

Cancellation has an empty body. It is allowed only in `pending_payment` or
`confirmed`; otherwise `409 ORDER_CANNOT_BE_CANCELLED`. Reservations are
released and non-captured payments become `failed`. Customer cancellation
does not initiate a customer-facing refund endpoint; refunds are an
administrator/provider workflow, and resulting refund state appears in order
detail after Razorpay webhooks. A captured Razorpay order may therefore remain
`cancelled` until an administrator creates a refund.

## Recommended frontend workflows

1. **Cart page:** read server cart when signed in; validate quantities using
   returned errors, not a client stock cache. For merchants display the bulk
   tier price and prevent unsupported quantities.
2. **Wishlist page:** merge local IDs immediately after sign-in, then use the
   returned list; show `unavailableProductIds` as non-blocking removals.
3. **Address picker:** list addresses, create/edit as needed, and submit IDs
   (never send an address object to checkout). Keep the selected IDs until the
   order response.
4. **Checkout:** fetch summary immediately before payment, block when
   `canCheckout` is false or warnings exist, submit a fresh UUID
   `Idempotency-Key`, and use the server's Razorpay amount/order ID.
5. **Payment result:** call verification after SDK success, then poll
   `GET /api/v1/checkout/orders/:id` or refresh the order list because webhook
   capture may arrive after verification. Treat webhook/status as authoritative.
6. **Recovery:** on timeout, repeat the same idempotency key rather than
   creating a second order. On expired/failed payment, show the cancelled
   order and restore cart UI from the user's current cart (the server may
   have cleared it at initial Razorpay order creation).

## Returns

Returns use the same authenticated customer/merchant token as orders. `POST
/api/v1/orders/:id/returns` requires `items` (`productId`, `quantity`), `reason`,
optional `customerNote`, and `pickupAddressId`. The address must belong to the
authenticated user; its complete value is copied immutably to `pickupAddress`
on the return. `GET /api/v1/returns/:returnId` returns the complete return and
populated order summary. Listings are available at `/api/v1/returns` and
`/api/v1/orders/:id/returns` with `search`, `status`, `reason`, `from`, `to`,
`paymentMethod`, `paymentStatus`, `page`, `limit`, and `sort=newest|oldest`.
`GET /api/v1/returns/filters` describes supported statuses, reasons, and
payment values. Customers can cancel with
`POST /api/v1/returns/:returnId/cancel` body `{ "reason": "..." }` (maximum
500 characters).

For COD returns, `refundMethodId` is also required. Customers and merchants
can save and manage refund destinations using:

| Method   | Path                                     | Purpose                                 |
| -------- | ---------------------------------------- | --------------------------------------- |
| `POST`   | `/api/v1/refund-methods`                 | Save a UPI or bank-transfer destination |
| `GET`    | `/api/v1/refund-methods`                 | List saved destinations                 |
| `GET`    | `/api/v1/refund-methods/:refundMethodId` | Get one saved destination               |
| `PATCH`  | `/api/v1/refund-methods/:refundMethodId` | Replace and validate a destination      |
| `DELETE` | `/api/v1/refund-methods/:refundMethodId` | Delete a destination                    |

UPI request:

```json
{
  "method": "upi",
  "upiId": "merchant@example",
  "confirmUpiId": "merchant@example",
  "label": "Primary UPI",
  "isDefault": true
}
```

Bank-transfer request:

```json
{
  "method": "bank_transfer",
  "accountHolderName": "Hari Asok",
  "accountNumber": "123456789012",
  "confirmAccountNumber": "123456789012",
  "ifscCode": "HDFC0001234",
  "confirmIfscCode": "HDFC0001234",
  "bankName": "HDFC Bank",
  "branchName": "Kochi Main Branch",
  "accountType": "savings",
  "label": "Primary bank account",
  "isDefault": true
}
```

UPI ID, account number, IFSC code, required bank fields, and both confirmation
values are validated by the API. Account numbers are masked in customer-facing
refund-method list/detail responses. The selected method is copied into the
return as an immutable refund-destination snapshot for admin processing.

COD refund methods are not used for Razorpay returns; Razorpay returns use the
provider refund lifecycle and are completed automatically after a processed
refund webhook.

Allowed return transitions are:
`requested -> approved|rejected|cancelled`,
`approved -> pickup_pending|cancelled`,
`pickup_pending -> received|cancelled`,
`received -> inspection_pending`,
`inspection_pending -> approved_for_refund|rejected`,
`approved_for_refund -> refund_pending`, `refund_pending -> completed` (the
automatic Razorpay path) or `refunded` (legacy/manual records), and
`refunded -> completed`. All other transitions are rejected. A processed
linked refund adds `Refund processed` and `Return completed` timeline entries.

## Profile and password

Customer and merchant accounts use these authenticated endpoints:

| Method  | Path                       | Purpose                           |
| ------- | -------------------------- | --------------------------------- |
| `GET`   | `/api/v1/profile`          | Get the current profile           |
| `PATCH` | `/api/v1/profile`          | Update name, email, and/or mobile |
| `PATCH` | `/api/v1/profile/password` | Change the password               |

Profile updates require `currentPassword`, even when changing only email or
mobile:

```json
{
  "currentPassword": "CurrentPassword123!",
  "name": "Updated Customer Name",
  "email": "updated@example.com",
  "mobile": "+919876543299"
}
```

At least one of `name`, `email`, or `mobile` must be supplied. Email addresses
are normalized to lowercase, mobile numbers use the supported international
format, and email/mobile values must be unique across all accounts.

Password changes use:

```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewPassword123!",
  "confirmNewPassword": "NewPassword123!"
}
```

The current password must match, the new password must contain at least eight
characters, and the confirmation must match. A successful password change
revokes refresh tokens; the user should sign in again on other devices.
Password hashes are never returned.

Typical errors are `CURRENT_PASSWORD_INVALID` (`401`),
`EMAIL_ALREADY_IN_USE` or `MOBILE_ALREADY_IN_USE` (`409`),
`PASSWORD_NOT_SET` (`409`), and `INVALID_PROFILE_REQUEST` (`400`).
