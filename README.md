# TGSCO Backend

Node.js and Express API for TGSCO's e-commerce and portfolio content management platform.

## Requirements

- Node.js 20+
- MongoDB 6+

## Setup

```bash
npm install
copy .env.example .env
```

Update `.env` with the local MongoDB connection string, then start the API:

```bash
npm run dev
```

The API is available at `http://localhost:5000`. The initial health endpoint is
`GET /api/v1/health`.

For multiple frontend origins, separate `CORS_ORIGIN` values with commas:

```text
CORS_ORIGIN=http://localhost:4200,http://localhost:5173,https://tgsco-personal.vercel.app
```

On startup, the API creates the default admin if the configured email does
not already exist. If it already exists, creation is skipped. Configure these
values in `.env` before using the application outside local development:

```text
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password
```

The password is stored as a bcrypt hash and is never logged.

## Postman collection

Import [postman/TGSCO Backend.postman_collection.json](./postman/TGSCO%20Backend.postman_collection.json)
into Postman for CMS, health, and admin-auth workflows. E-commerce has a
separate [postman/TGSCO E-commerce API.postman_collection.json](./postman/TGSCO%20E-commerce%20API.postman_collection.json)
collection organized by Admin, Customer, and Merchant.

Run **Admin Login** before protected requests. Its test script automatically
stores `admin_token`, `admin_refresh_token`, `admin_id`, and `admin_role` as
collection variables. **Admin Refresh Token** rotates and replaces both token
variables. **Admin Logout** revokes the refresh token and clears the stored
admin tokens.

When a new backend workflow is implemented, add it to its own numbered folder
with subfolders for distinct actors or lifecycle areas. Add only the variables
that workflow actually needs, and store reusable response values using
collection variables, for example:

```javascript
pm.collectionVariables.set('product_id', pm.response.json().data.id);
```

## Admin authentication

Authentication endpoints are available under `/api/v1/auth`:

| Method | Endpoint   | Purpose                                     |
| ------ | ---------- | ------------------------------------------- |
| `POST` | `/login`   | Sign in with admin credentials              |
| `POST` | `/refresh` | Rotate a refresh token and issue new tokens |
| `POST` | `/logout`  | Revoke a refresh token                      |

## E-commerce authentication and catalogue

Customer and merchant sign-in uses mobile OTP verification through 2Factor:

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| `POST` | `/auth/ecommerce/request-otp` | Send a customer or merchant OTP |
| `POST` | `/auth/ecommerce/resend-otp` | Replace an active OTP and send a new one |
| `POST` | `/auth/ecommerce/verify-otp` | Verify the OTP and issue JWT sessions |

Set `TWO_FACTOR_API_KEY` and, when required by the 2Factor account,
`TWO_FACTOR_TEMPLATE_NAME`. OTP challenges expire after
`OTP_EXPIRES_MINUTES` and are limited to five verification attempts.

The resend endpoint accepts the same payload as `request-otp`. Existing users
can send only `mobile`; new registrations can resend with `mobile`, `email`,
`name`, and `password`.

Catalogue endpoints are available under `/api/v1/catalog`:

| Method | Endpoint | Access |
| ------ | -------- | ------ |
| `GET` | `/catalog/categories` | Public |
| `GET` | `/catalog/groups` | Public catalogue groups |
| `GET` | `/catalog/products` | Public PLP with filters and pagination |
| `GET` | `/catalog/products/<slug>` | Public PDP |
| `GET` | `/catalog/admin/groups` | Admin group management |
| `GET` | `/catalog/admin/categories` and `/catalog/admin/categories/<id>` | Admin |
| `POST/PATCH/DELETE` | `/catalog/admin/categories` and `/catalog/admin/categories/<id>` | Admin |
| `GET` | `/catalog/admin/products` and `/catalog/admin/products/<id>` | Admin |
| `POST/PATCH/DELETE` | `/catalog/admin/products` and `/catalog/admin/products/<id>` | Admin |

The public groups response contains database-managed top-level groups. Each
category can reference a group through `groupId`, and the public category
response includes each category ID. Product browsing accepts
`categoryId=<id>` or comma-separated `categoryIds=<id-1>,<id-2>` for ID-based
filtering. Slug and type filters remain supported as compatibility aliases.
New groups can be added without changing the API code.

Product catalogue content supports the Figma PDP/PLP fields, product images,
inventory, product attributes, and merchant bulk-price tiers. Product image
uploads use multipart fields such as `images[0].url`; the uploaded DigitalOcean
URL is saved in the product document. Products relate to categories through
the `categoryIds` array, while `categorySlugs` and `types` are derived/indexing
fields used for public catalogue filtering. This allows one product to appear
under multiple categories such as Weddings, Cotton, and Pochampally.

## Homepage content

Each homepage section has its own public and admin endpoints. The supported
section paths are `hero`, `our-story`, `techniques`, `journey`, `makers`,
`why-choose-us`, `featured-collections`, `government-initiatives`, `blog`,
`news-events`, and `footer`.

For every section, the following endpoints are available:

| Method   | Endpoint                         | Access |
| -------- | -------------------------------- | ------ |
| `GET`    | `/home-content/<section>`        | Public |
| `POST`   | `/home-content/<section>`        | Admin |
| `PATCH`  | `/home-content/<section>`        | Admin |
| `DELETE` | `/home-content/<section>`        | Admin |

Create or update a section with `multipart/form-data`. Send the JSON section
data in a `content` field and attach one or more image files using any field
names:

```text
content: {"title":"Preserving Heritage","buttonText":"Shop Now"}
heroImage: <hero.jpg>
backgroundImage: <background.jpg>
```

Images are uploaded to DigitalOcean Spaces and the response includes their
`url`, original form-data `field`, and storage `key`. There is no per-image
size limit in the upload middleware; requests are limited to 20 files.
Configure the Spaces credentials in `.env` before using image uploads.
Uploaded content objects are marked `public-read` so the returned URLs can be
used directly by the frontend. Existing objects uploaded before this setting
was enabled must be re-uploaded or have their permissions changed in the
DigitalOcean Spaces console.

The `techniques` section requires two images for each item: one `mainImage`
and one `borderImage`. Use indexed form-data file fields such as
`items[0].mainImage` and `items[0].borderImage`. The
`featured-collections` section requires `mainImage`; its `borderImage` is
optional. The JSON `content.items` array and uploaded image fields must use
matching indexes. The techniques section may also include a separate
`backgroundImage` file.

`GET /home-content` remains available to return all stored sections for page
bootstrap requests.

The `makers` section is a carousel of complete maker profiles. Each item has
its own `slug`, `image`, `name`, `role`, and `quote`. The selected maker can
also be loaded with:

```text
GET /home-content/makers/items/<slug>
```

The `our-story` section uses a `videoUrl` in its JSON content instead of an
uploaded `storyImage`. The `who-we-are` About section uses one uploaded
`primaryImage` plus a `videoUrl`; its previous `supportImage` upload is not
required. Use `POST /media/videos` first, then copy the returned public URL
into the section's `videoUrl`.

## Scheme page content

Scheme page sections use the same public-read and admin-write lifecycle under
`/scheme-content`:

```text
/scheme-content/schemes-hero
/scheme-content/supporting-weavers
/scheme-content/current-schemes
```

For every section, `GET` is public and `POST`, `PATCH`, and `DELETE` require
the admin bearer token. Create and update requests use `multipart/form-data`
with the section JSON in `content` and the section image in its corresponding
file field. The Postman collection's `04 Scheme Content` folder contains the
screen-derived content for the Schemes banner, supporting-weavers section,
current scheme navigation, and the complete Chenetha Lakshmi Scheme detail
data nested inside `current-schemes`.

Each entry in `current-schemes.schemes` owns its heading, content, and image.
The selected scheme can be loaded with:

```text
GET /scheme-content/current-schemes/items/<slug>
```

For example, selecting `chenetha-lakshmi-scheme` returns its matching image
and detail content; selecting `cooperative-membership` returns that scheme's
matching image and content.

## Our Heritage page content

Our Heritage sections use the same public-read and admin-write lifecycle under
`/heritage-content`:

```text
/heritage-content/heritage-hero
/heritage-content/chain-of-craft
/heritage-content/numbers
/heritage-content/sustainability
/heritage-content/mission-guides
/heritage-content/awards
```

The Postman collection's `05 Our Heritage Content` folder contains the
screen-derived text, metrics, people, awards, role cards, colors, and image
fields for each section. The `You (Customer)` card is nested as the final
role in `chain-of-craft`.

The `sustainability` section supports multiple titled images through its
content JSON:

```json
{
  "images": [
    {
      "title": "Slow fashion, made with intention",
      "field": "images[0].image"
    }
  ]
}
```

Attach files using the matching indexed fields, such as
`images[0].image` and `images[1].image`. The `05 Our Heritage Content`
Postman folder includes six image-title pairs.

## News and Events page content

News and Events sections use the same public-read and admin-write lifecycle
under `/news-content`:

```text
/news-content/news-hero
/news-content/latest-news
/news-content/exhibitions
/news-content/events-calendar
/news-content/press-releases
/news-content/threads-of-triumph
/news-content/media-gallery
```

Each section supports public `GET` and admin `POST`, `PATCH`, and `DELETE`.
Media Gallery and Threads of Triumph also expose:

```text
GET /news-content/media-gallery/items/<slug>
GET /news-content/threads-of-triumph/items/<slug>
```

Gallery items contain a stable `slug`, one main image, and an
`associatedImages` array. Threads of Triumph contains four carousel items;
each item has its own `slug`, `subheading`, `description`, and `mainImage`.
The selected-item GET lets the frontend load the next or previous carousel
item when a card is clicked. The Postman collection's `06 News and Events
Content` folder contains the screen-derived content and multipart image
fields.

Media Gallery contains four categories: Exhibitions, Weaving villages,
Campaigns, and Cooperative events. Each category has a title, hover subtitle,
one main image, two associated images, and a `videoLink`. The selected gallery
item endpoint returns all of these fields for the clicked category.

Exhibition image items also expose `hoverText`. The two screenshot headings are
stored as `NATIONAL EXHIBITIONS` and `INTERNATIONAL TEXTILE FAIRS`, so the
frontend can display the matching text when the image is hovered.

## Contact page content

Contact page sections use the same public-read and admin-write lifecycle under
`/contact-content`:

```text
/contact-content/contact-hero
/contact-content/regional-map
/contact-content/contact-form
/contact-content/faq
```

The regional map section stores districts in `content.regions`. Every district
has a `regionId` made from its lowercase district name with spaces replaced by
hyphens (for example, `bhadradri-kothagudem`), plus one or more locations. Each
location contains its title, image URL, address, phone, email, timing, and
directions URL. The public frontend request is:

```text
GET /contact-content/regional-map
```

The admin CMS saves this section with:

```text
POST /contact-content/regional-map
```

This POST is an upsert for the regional map, so it creates the section when it
does not exist and replaces its content when it already exists. A selected
office can still be loaded with:

```text
GET /contact-content/regional-map/items/<slug>
```

The Postman collection's `07 Contact Content` folder contains the screen
content, FAQ entries, contact fields, office carousel items, and image fields.

Contact form submissions use a separate resource:

```text
POST /contact-inquiries
GET  /contact-inquiries
GET  /contact-inquiries?status=new
```

The `POST` endpoint is public and accepts `name`, `email`, `phone`, and
`message`. The `GET` endpoints require the admin bearer token and return
newest submissions first. Supported status filters are `new`, `read`, and
`resolved`.

## Video media

Videos can be uploaded to DigitalOcean Spaces through the admin-only endpoint:

```text
POST /media/videos
DELETE /media/videos
```

Upload one file in the `video` multipart field. Supported formats are MP4,
WebM, MOV, AVI, and MPEG, with a maximum size of 100 MB. The upload response
contains the public `url` and storage `key`:

```json
{
  "key": "videos/uuid-example-video.mp4",
  "url": "https://blr1.digitaloceanspaces.com/mbm/videos/uuid-example-video.mp4",
  "contentType": "video/mp4",
  "originalName": "example-video.mp4"
}
```

Delete using the returned key:

```json
{
  "key": "videos/uuid-example-video.mp4"
}
```

The `08 Video Media` Postman folder contains ready-to-use upload and delete
requests. New videos are uploaded with public-read access.

## About page content

About page sections use the same public-read and admin-write lifecycle under
`/about-content`:

```text
/about-content/about-hero
/about-content/who-we-are
/about-content/milestones
/about-content/vision
/about-content/mission
/about-content/purpose
```

Each section supports `GET`, `POST`, `PATCH`, and `DELETE`. Create and update
requests use `multipart/form-data`, with section JSON in `content` and image
files in their corresponding form-data fields. The complete prefilled payloads
are available in the `03 About Content` workflow in the Postman collection.

Login returns a JWT access token valid for 24 hours and a rotating refresh
token valid for 30 days. Refresh tokens are stored as SHA-256 hashes and are
revoked after use or logout.

## Error responses

API errors use one consistent JSON shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted information and correct the highlighted fields.",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address"
      }
    ]
  },
  "requestId": 12
}
```

The `code` is stable for frontend handling, while `message` is written for
users. Field-level `details` are included when the server can identify the
specific invalid fields. Unexpected technical details are logged server-side
and are not exposed in production responses.

## Commands

| Command                | Purpose                              |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start the API with Node's watch mode |
| `npm test`             | Run the test suite                   |
| `npm run lint`         | Run ESLint                           |
| `npm run format:check` | Check Prettier formatting            |

## Structure

```text
src/
  config/       Environment and logger configuration
  database/     MongoDB connection lifecycle
  models/       Mongoose data models
  middleware/   Shared Express middleware
  routes/       Versioned API route registration
  app.js        Express application composition
  server.js     Production process entry point
tests/          Unit and API integration tests
uploads/        Local upload target (ignored by Git)
```
