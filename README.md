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
into Postman. The collection currently includes only the implemented system
health and admin-auth workflows.

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

The `techniques` and `featured-collections` sections require two images for
each item: one `mainImage` and one `borderImage`. Use indexed form-data file
fields such as `items[0].mainImage` and `items[0].borderImage`. The JSON
`content.items` array and the uploaded image pairs must have matching indexes.
The techniques section may also include a separate `backgroundImage` file.

`GET /home-content` remains available to return all stored sections for page
bootstrap requests.

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
