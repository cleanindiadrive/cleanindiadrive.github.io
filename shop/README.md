# Silly Sensei shop

Ecommerce storefront with the supplied branding, four collections (Paintings, Clay models, Molds and Rock paints), product management, customer accounts, delivery pins and printable labels. Checkout collects a request only; no payment is taken.

## Run locally

Run `npm start` and open `http://127.0.0.1:4173/shop.html`. The app always connects to **shopatsillysensei**. Preview mode, demo accounts, local product overrides and sample catalogue switches have been removed. Old `?demo=` parameters have no effect. The app does not seed or publish products automatically. Add real products through an authorized admin account.

`index.html`, `auction.html`, `admin.html` and `checkout.html` redirect to the appropriate store route. Public navigation shows My account; it does not advertise the admin dashboard.

## Customer accounts

- Google sign-in opens the customer dashboard. Verified admin emails or a trusted admin claim open the studio dashboard automatically.
- Dashboard: overview, paginated checkout request history (20 per page), request status timeline, item totals, delivery details, confirmed map links, product notes/reference images, and a profile with a default delivery address.
- Profile details are saved privately in `customers/{uid}` and prefill later checkouts. A delivery pin must still be confirmed for each request.
- Request statuses are Details received, Reviewed, Contacted and Closed. These do not imply payment or shipping.
- Guest checkout uses anonymous authentication. Guest requests are not automatically transferred to a Google account; sign in before submitting to keep requests in account history.
- The logout animation uses the supplied SVG and timings, with a yellow button, charcoal text and green figure/door.

## Admin

Create/edit products, upload photos, set price/stock/category/material/dimensions/care, control publication and featured status, and archive reversibly. The request inbox includes customer details, product-specific notes/private reference images and review status controls.

Store settings controls the announcement and homepage image banner independently: visibility, text, destination links, button label and image upload. The optional review carousel accepts seven genuine review images via HTTPS URLs; it remains hidden until configured. It uses the supplied seven-position choreography, advances every 4.2 seconds with the original one-second transition, and pauses on hover/focus or its pause button. Sample testimonials are not published.

## Address pins, product notes and labels

- Leaflet + OpenStreetMap tiles and the open-source Photon geocoder provide address lookup, draggable pins and optional device location. No Google Maps key is needed. Customers must confirm a pin; browser validation and Firestore rules both enforce this.
- Search runs on a button press, with throttling/cache/timeouts. Lookup sends street/city/state/PIN to Photon, never the customer's name, phone, email or apartment. Device location is requested only after a click. Manual pin placement works if lookup is unavailable. Editing the address requires reconfirming the pin.
- Configure providers in `map-config.js`. Respect [OSM's tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Photon's usage guidance](https://github.com/komoot/photon). Use self-hosting or a suitable provider for higher-volume use.
- Each product accepts a note of up to 1,000 characters and up to three JPG/PNG/WebP reference images (6 MB each). Drafts stay in tab memory, not local storage. Images are resized/re-encoded. Private Storage paths are `references/{uid}/{requestId}/{productId}/{image}.jpg`; owner/admin access is enforced. The app uses authenticated blob reads, not public download-token URLs.
- Notes and image paths save atomically with their checkout request in `checkoutRequests/{id}/customizations/{productId}`.
- **Edit & print label** opens an admin editor with a live print preview. Recipient, address, contact, heading, handling instructions, QR heading and footer message are editable. **Save label text** stores overrides in `checkoutRequests/{id}/labels/print`. **Use customer details** restores the original defaults; save explicitly to keep them.
- Label overrides do not modify the original customer details or pin. The QR always points to the original confirmed location. Check any edited address against that pin before dispatch.
- Print current edits on 100 × 150 mm paper, 100% scale, without browser headers/footers. Long addresses show an A4 recommendation. QR generation is local. Labels neither buy postage nor indicate payment.

## Firebase setup required for live use

The supplied public web configuration is in `firebase-config.js`. No cloud configuration, rules, indexes, products or hosting have been deployed by this task.

1. Enable Cloud Firestore and Cloud Storage in `shopatsillysensei`.
2. Enable Google and Anonymous providers in Authentication. Authorize `localhost` (or `127.0.0.1`) and the actual hosting domains.
3. Publish `firestore.rules`, `storage.rules` and **`firestore.indexes.json`**. The composite `uid` + `createdAt` index is required for customer request history. Wait for it to finish building.
4. Configure Storage CORS for private image previews. `storage-cors.json` contains local origins and the default Hosting domain; add your actual production domain. Follow [Firebase's CORS instructions](https://firebase.google.com/docs/storage/web/download-files#cors_configuration): `gsutil cors set storage-cors.json gs://shopatsillysensei.firebasestorage.app`.
5. The original three admin emails are retained in `firebase-config.js` and both rules files. Update all three together if needed. Email verification is mandatory, or use an admin custom claim issued by a trusted server.

With an authenticated Firebase CLI, publish backend configuration using:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project shopatsillysensei
```

Optional hosting deployment: `npx firebase deploy --only hosting --project shopatsillysensei`. Test fixtures and configuration files are excluded from Hosting. Test-only emulator project IDs beginning with `demo-` are isolated development infrastructure, not an app preview mode.

## Checkout boundaries

Checkout stores `checkoutRequests`, not confirmed orders. It supports up to five different products (up to 99 units each, stock-capped). This keeps full item/address validation inside Firestore's rules evaluation budget. Prices are refreshed before submission but stored amounts remain estimates for admin review. No payment credentials are collected, stock is not reserved/decremented, and no email is sent. Failed writes retain the cart and form; request IDs make retries idempotent.

Before payments, add a trusted server to calculate totals/shipping/tax, reserve stock transactionally, create payment sessions and verify webhooks. Add upload abuse controls and orphaned-upload cleanup. Replace provisional contact/shipping/terms text before launch. The app does not initialize Analytics or migrate the old auction's Realtime Database.

## Source and verification

- `shop.js` / `shop.html`: routing and storefront/admin shell.
- `customer-dashboard.js`, `profile.js`, `dashboard.css`: account UI, profile validation and responsive layout.
- `store.js`: Firebase Auth, Firestore and Storage adapter; there is no preview adapter.
- `store-settings.js`: banners and real review image settings.
- `store-content.js`, `storefront-view.js`, `content-editor.js`: schema-driven storefront editing and desktop/mobile draft previews. Open `shop.html#admin/content` after signing in as a verified administrator. Branding, navigation labels, page headings, category copy/images, story, service strip, footer links, policy text and section visibility can be changed. Banners/reviews remain in their own tab. Previews render the shared storefront templates in an inert iframe; they do not enable a public demo mode or grant authentication.
- Storefront changes publish atomically to `storeContent/{section}`. Deploy the updated `firestore.rules` before publishing. Unpublished drafts stay in tab memory while navigating admin sections and clear on account changes; reload loses them. Image uploads are public studio assets, and only their placement stays unpublished until publishing. Discard restores the current published text.
- `delivery-location.js`, `location-utils.js`, `map-config.js`: required delivery map.
- `labels.js`, `label-data.js`: editable labels and safe text rendering.
- `customization.js`: per-product notes and image drafts.
- `shop-effects.js`, `animations.scss`, `logout.scss`: supplied cart/truck/review/logout animation structure and timings. Compiled CSS is checked in. Compile SCSS with `npx sass@1.80.4 input.scss output.css --no-source-map`.
- `assets/vendor`: local Leaflet, qrcode-generator, GSAP, jQuery and Font Awesome font with original license notices. The GSAP script includes its license link.

Checks:

```sh
npm run check
npm test
npx firebase emulators:exec --only firestore --project demo-silly-shop "node --test tests/firestore.test.mjs"
npx firebase emulators:exec --only storage --project demo-silly-shop "node --test tests/storage.test.mjs"
```

`tests/dashboard.html` is an isolated visual component fixture with fictional data. It does not import the Firebase adapter or grant app access, and is excluded from deployment. Production Google sign-in, uploads and writes require the Firebase setup above; emulator tests do not establish that production configuration is deployed.

`tests/content-editor.html` similarly checks the real editor component without Firebase writes, including a simulated publishing failure. `scripts/content-rules.mjs` regenerates the schema validation block in Firestore rules after changes to the content schema.

## VS Code port forwarding

Run `npm start` from this folder. The HTTP server listens on `127.0.0.1:4173`. In VS Code's Ports panel forward **4173**, then open the generated forwarded URL with `/shop.html` (or `/shop.html#admin/content` for the editor). Keep the server running. Google sign-in from a forwarded hostname requires adding that exact hostname to Firebase Authentication's Authorized domains. Private reference-image previews also require that HTTPS origin in Storage CORS. Forwarding does not deploy Firebase rules or indexes.
