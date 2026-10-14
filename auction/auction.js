const firebaseConfig = {
    apiKey: "AIzaSyDma_UrBD5XQICj5LOu214Fu3va_7VnvDg",
    authDomain: "sillysensei-b251b.firebaseapp.com",
    databaseURL: "https://sillysensei-b251b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sillysensei-b251b",
    storageBucket: "sillysensei-b251b.firebasestorage.app",
    messagingSenderId: "859697431303",
    appId: "1:859697431303:web:f91ce7535a3aff27cc7ba2",
    measurementId: "G-XGR07BYBGN",
};

let app, database, databaseReady;
let get, onValue, push, ref, remove, serverTimestamp, set, update;
function ensureDatabase() {
    if (!databaseReady) databaseReady = Promise.all([
        import("https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js"),
    ]).then(([apps, api]) => {
        app = apps.getApps().length ? apps.getApp() : apps.initializeApp(firebaseConfig);
        database = api.getDatabase(app);
        ({ get, onValue, push, ref, remove, serverTimestamp, set, update } = api);
    }).catch((error) => { databaseReady = null; throw error; });
    return databaseReady;
}
const AUTH_MODULE_URL = "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
const $ = (id) => document.getElementById(id);
const ADMIN_EMAILS = new Set(["abhishekredddy500@gmail.com", "vishnudeviprasadshetty@gmail.com", "supritachat.25@gmail.com"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 5.7 * 1024 * 1024;
const PRODUCTS_PATH = "auction/gallery/products";
const IMAGES_PATH = "auction/gallery/images";
const CACHE_KEY = "sillysensei-gallery-v2";
const AUTH_HINT_KEY = "sillysensei-gallery-admin";
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const saveData = Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "") || (connection?.downlink && connection.downlink < 1.5));

let currentUser = null;
let isAdmin = false;
let auth = null;
let provider = null;
let authApi = null;
let authReady = null;
let products = [];
let editingProductId = null;
let productsUnsubscribe = null;
let storedImages = new Map();
let storedPreviews = new Map();
let previewLoads = new Map();
let fullImageLoads = new Map();
let cardSignatures = new Map();
let cardNodes = new Map();
let cardsInView = new Set();
let imageQueue = [];
let activeImageReads = 0;
let hasLiveProducts = false;
let splashCheckFrame = 0;
let backgroundSettled = false;
const decodedProductImages = new WeakSet();
let productRevision = new Map();
let optimizingImages = false;
let productImageIndexes = new Map();
let previewObjectUrls = [];
let lightboxProduct = null;
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxZoom = 1;
let lightboxOffsetX = 0;
let lightboxOffsetY = 0;
let touchStart = null;
let pointerStart = null;
let pinchStartDistance = 0;
let pinchStartZoom = 1;

const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function showNotice(element, message, type = "") {
    element.textContent = message;
    element.className = `notice${type ? ` ${type}` : ""}`;
}

function hideLoadingScreen(settled = true) {
    $("gallery-loading").classList.add("is-hidden");
    if (settled) scheduleSplashReveal();
}

function scheduleSplashReveal() {
    if (!hasLiveProducts || splashCheckFrame || $("loading-screen").classList.contains("is-hidden")) return;
    splashCheckFrame = window.requestAnimationFrame(() => {
        splashCheckFrame = 0;
        let pending = !backgroundSettled;
        for (const card of $("gallery-grid").children) {
            const button = card.querySelector(".product-image-button");
            if (!button) continue;
            const bounds = button.getBoundingClientRect();
            if (bounds.bottom <= 0 || bounds.top >= window.innerHeight || bounds.right <= 0 || bounds.left >= window.innerWidth) continue;
            // Force the visible images to load behind the overlay, even if marked lazy.
            const image = button.querySelector("img");
            if (image) { image.loading = "eager"; image.fetchPriority = "high"; }
            if (button.classList.contains("is-image-loading")) {
                pending = true;
                cardsInView.add(card.dataset.productId);
                const product = products.find((item) => item.id === card.dataset.productId);
                if (product) hydrateProductImages(product);
            }
        }
        if (!pending) window.dismissGallerySplash();
    });
}

// Reuses the head preload; the page background must also be ready for the reveal.
const initialBackground = new Image();
initialBackground.onload = initialBackground.onerror = () => {
    backgroundSettled = true;
    scheduleSplashReveal();
};
initialBackground.src = $("gallery-background-preload").href;

function restoreCachedProducts() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (!cached || Date.now() - cached.savedAt > 24 * 60 * 60 * 1000 || !Array.isArray(cached.products)) return;
        products = cached.products.filter((product) => product && typeof product.id === "string" && product.visible !== false);
        renderProducts();
        hideLoadingScreen(false);
        showNotice($("gallery-notice"), "Showing saved products. Checking the latest prices and availability…");
    } catch { /* Storage can be disabled or full. Live loading still works. */ }
}

function cachePublicProducts() {
    try {
        // Bound synchronous storage work; never persist hidden admin products or full images.
        const publicProducts = products.filter((product) => product.visible !== false).map((product) => ({
            ...product,
            thumbnailUrls: [],
            imageUrl: product.imageUrl?.startsWith("data:") ? "" : product.imageUrl,
            imageUrls: product.imageUrls?.filter((url) => !url.startsWith("data:")),
        }));
        const value = JSON.stringify({ savedAt: Date.now(), products: publicProducts });
        if (value.length < 300000) localStorage.setItem(CACHE_KEY, value);
        else localStorage.removeItem(CACHE_KEY);
    } catch { /* A cache miss must not prevent the gallery from working. */ }
}

function setBusy(button, busy, busyText, idleText) {
    button.disabled = busy;
    const label = button.querySelector("[data-button-label]") || button;
    label.textContent = busy ? busyText : idleText;
}

function displayUser(user) { $("user-badge").textContent = user ? (user.displayName || user.email || "Signed in") : "Guest"; }

async function checkAdmin(user) {
    if (ADMIN_EMAILS.has((user.email || "").toLowerCase())) return true;
    try {
        const token = await user.getIdTokenResult(true);
        return token.claims.admin === true;
    } catch (error) {
        console.warn("Could not load gallery admin status:", error);
        return false;
    }
}

function updateAdminVisibility() { $("admin-panel").classList.toggle("is-hidden", !isAdmin); }

async function ensureAuth() {
    if (authReady) return authReady;
    authReady = Promise.all([ensureDatabase(), import(AUTH_MODULE_URL)]).then(([, api]) => {
        authApi = api;
        auth = api.getAuth(app);
        provider = new api.GoogleAuthProvider();
        api.getRedirectResult(auth).catch((error) => {
            if (error?.code) showNotice($("gallery-notice"), error.message || "Sign-in did not complete.", "error");
        });
        api.onAuthStateChanged(auth, handleAuthStateChanged);
        return api;
    }).catch((error) => {
        authReady = null;
        throw error;
    });
    return authReady;
}

function scheduleAuthBoot() {
    try { if (localStorage.getItem(AUTH_HINT_KEY) !== "1") return; } catch { return; }
    const boot = () => ensureAuth().catch((error) => console.warn("Could not initialize optional admin sign-in:", error));
    if ("requestIdleCallback" in window) window.requestIdleCallback(boot, { timeout: 1500 });
    else window.setTimeout(boot, 900);
}

function galleryEntriesForProduct(product) {
    const imageIds = Array.isArray(product?.imageIds) ? product.imageIds : [];
    const thumbnailUrls = Array.isArray(product?.thumbnailUrls) ? product.thumbnailUrls : [];
    const entries = imageIds.map((imageId, index) => ({
        imageId,
        thumbnail: storedPreviews.get(`${product.id}/${imageId}`) || (typeof thumbnailUrls[index] === "string" ? thumbnailUrls[index] : ""),
        hasPreview: Array.isArray(product.previewImageIds) && product.previewImageIds.includes(imageId),
        full: storedImages.get(`${product.id}/${imageId}`) || "",
    }));
    const externalImages = Array.isArray(product?.imageUrls)
        ? product.imageUrls.filter((image) => typeof image === "string" && image)
        : [];
    if (!externalImages.length && product?.imageUrl) externalImages.push(product.imageUrl);
    externalImages.forEach((url) => entries.push({ url, thumbnail: url, full: url }));
    return entries;
}

function imageSourceForEntry(entry) { return entry?.thumbnail || entry?.full || entry?.url || ""; }

function imageCountForProduct(product) { return galleryEntriesForProduct(product).length; }

function basePriceForProduct(product) {
    const price = Number(product?.basePrice);
    return Number.isFinite(price) && price >= 0 ? `₹${price.toLocaleString("en-IN")}` : "";
}

function renderProducts() {
    const visibleProducts = products.filter((product) => isAdmin || product.visible !== false);
    $("gallery-count").textContent = visibleProducts.length ? `${visibleProducts.length} ${visibleProducts.length === 1 ? "product" : "products"}` : "";
    $("empty-card").classList.toggle("is-hidden", visibleProducts.length > 0);
    $("gallery-grid").classList.toggle("is-hidden", visibleProducts.length === 0);
    const grid = $("gallery-grid");
    const visibleIds = new Set(visibleProducts.map((product) => product.id));
    for (const card of [...grid.children]) {
        if (!visibleIds.has(card.dataset.productId)) {
            imageObserver?.unobserve(card);
            cardsInView.delete(card.dataset.productId);
            cardSignatures.delete(card.dataset.productId);
            cardNodes.delete(card.dataset.productId);
            card.remove();
        }
    }
    visibleProducts.forEach((product, index) => {
        const card = renderProduct(product, index < 2);
        if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null);
        if (imageObserver) imageObserver.observe(card);
        else { cardsInView.add(product.id); hydrateProductImages(product); }
    });
    renderAdminProducts();
    scheduleSplashReveal();
}

function renderProduct(product, prioritizeImage = false) {
    let card = cardNodes.get(product.id);
    const markup = renderProductCard(product, prioritizeImage);
    if (card && cardSignatures.get(product.id) === markup) return card;
    const template = document.createElement("template");
    template.innerHTML = markup;
    const nextCard = template.content.firstElementChild;
    if (card) {
        // Preserve the card element for IntersectionObserver and avoid touching other cards.
        card.replaceChildren(...nextCard.childNodes);
    } else card = nextCard;
    cardNodes.set(product.id, card);
    cardSignatures.set(product.id, markup);
    // Cached images can finish before their load event reaches the attached grid.
    queueMicrotask(() => card.querySelectorAll(".product-image-button img").forEach((image) => {
        if (image.complete) settleProductImage(image, image.naturalWidth > 0);
    }));
    return card;
}

async function settleProductImage(image, loaded) {
    const source = image.currentSrc || image.src;
    if (loaded && !decodedProductImages.has(image)) {
        try {
            await image.decode();
            decodedProductImages.add(image);
        } catch { loaded = false; }
    }
    if (!image.isConnected || (image.currentSrc || image.src) !== source) return;
    const button = image.closest(".product-image-button");
    if (!button) return;
    button.classList.remove("is-image-loading");
    button.classList.toggle("image-has-error", !loaded);
    button.setAttribute("aria-busy", "false");
    if (!loaded) {
        button.dataset.action = "retry-image";
        button.setAttribute("aria-label", "Image could not load. Retry image");
    } else {
        button.dataset.action = "zoom";
        button.setAttribute("aria-label", `Zoom ${image.alt || "product"} image`);
    }
    scheduleSplashReveal();
}

function refreshProduct(product) {
    if (!products.includes(product) || (!isAdmin && product.visible === false)) return;
    renderProduct(product, products.indexOf(product) < 2);
    hydrateProductImages(product);
}

function renderProductCard(product, prioritizeImage = false) {
    const entries = galleryEntriesForProduct(product);
    const images = entries.map(imageSourceForEntry);
    const index = Math.min(productImageIndexes.get(product.id) || 0, Math.max(images.length - 1, 0));
    productImageIndexes.set(product.id, index);
    const activeImage = images[index];
    const hiddenLabel = isAdmin
        ? product.visible === false ? '<span class="visibility-pill hidden-state">Hidden from visitors</span>' : '<span class="visibility-pill">Visible</span>'
        : "";
    const soldBadge = product.sold === true ? '<span class="sold-badge"><img src="https://raw.githubusercontent.com/cleanindiadrive/cleanindiadrive.github.io/refs/heads/main/assets/sold-stamp.png" loading="lazy" decoding="async" alt="Sold"></span>' : "";
    const imageLoading = prioritizeImage ? "eager" : "lazy";
    const imagePriority = prioritizeImage ? "high" : "low";
    const thumbnails = images.length > 1
        ? `<div class="product-thumbnails" aria-label="${escapeHtml(product.title || "Product")} images">${images.map((url, imageIndex) => `<button class="product-thumbnail${imageIndex === index ? " active" : ""}" type="button" data-action="select-image" data-product-id="${escapeHtml(product.id)}" data-image-index="${imageIndex}" aria-label="Show image ${imageIndex + 1}">${url ? `<img src="${escapeHtml(url)}" loading="lazy" decoding="async" width="58" height="46" alt="${escapeHtml(product.title || "Product")} image ${imageIndex + 1}">` : imageIndex + 1}</button>`).join("")}</div>`
        : "";
    const media = activeImage
        ? `<button class="product-image-button is-image-loading" type="button" data-action="zoom" data-product-id="${escapeHtml(product.id)}" data-image-index="${index}" aria-busy="true" aria-label="Zoom ${escapeHtml(product.title || "product")} image"><span class="media-skeleton skeleton" aria-hidden="true"></span><img src="${escapeHtml(activeImage)}" loading="${imageLoading}" fetchpriority="${imagePriority}" decoding="async" alt="${escapeHtml(product.title || "Product")}"><span class="image-retry">Image could not load. Tap to retry.</span></button><span class="zoom-hint">Click to zoom</span>`
        : entries.length
            ? `<button class="product-image-button is-image-loading" type="button" data-action="retry-image" data-product-id="${escapeHtml(product.id)}" aria-busy="true" aria-label="Loading ${escapeHtml(product.title || "product")} image. Tap to retry."><span class="media-skeleton skeleton" aria-hidden="true"></span><span class="sr-only">Loading image…</span><span class="image-retry">Image could not load. Tap to retry.</span></button>`
            : '<div class="product-placeholder"><div><strong>Image coming soon</strong>No image has been added yet.</div></div>';
    const basePrice = basePriceForProduct(product);
    return `<article class="gallery-card" data-product-id="${escapeHtml(product.id)}"><div class="product-media">${media}${soldBadge}<button class="media-control previous" type="button" data-action="previous-image" data-product-id="${escapeHtml(product.id)}" aria-label="Previous image"${images.length < 2 ? " disabled" : ""}>‹</button><button class="media-control next" type="button" data-action="next-image" data-product-id="${escapeHtml(product.id)}" aria-label="Next image"${images.length < 2 ? " disabled" : ""}>›</button></div><div class="product-body"><h3>${escapeHtml(product.title || "Untitled product")}</h3><p class="product-description">${escapeHtml(product.description || "")}</p>${basePrice ? `<p class="product-price">Base price · ${basePrice}</p>` : ""}${thumbnails}<div class="product-footer"><span>${images.length ? `${images.length} ${images.length === 1 ? "image" : "images"}` : "No images"}</span>${hiddenLabel}</div></div></article>`;
}

function renderAdminProducts() {
    if (!isAdmin) { $("admin-products").replaceChildren(); return; }
    $("optimize-images-button").classList.toggle("is-hidden", !optimizingImages && !products.some((product) => galleryEntriesForProduct(product).some((entry) => entry.imageId && !entry.hasPreview)));
    $("admin-product-count").textContent = products.length ? `${products.length} total` : "";
    if (!products.length) {
        $("admin-products").innerHTML = '<p class="admin-meta">No products added yet.</p>';
        return;
    }
    $("admin-products").innerHTML = products.map((product) => {
        const imageCount = imageCountForProduct(product);
        const basePrice = basePriceForProduct(product);
        return `<div class="admin-product-row"><div><h3>${escapeHtml(product.title || "Untitled product")}</h3><p>${product.visible === false ? "Hidden from visitors" : "Visible to visitors"} · ${product.sold === true ? "Sold" : "Available"} · ${imageCount} ${imageCount === 1 ? "image" : "images"}${basePrice ? ` · Base price ${basePrice}` : ""}</p></div><div class="admin-product-actions"><button type="button" data-action="edit-product" data-product-id="${escapeHtml(product.id)}">Edit</button><button type="button" data-action="toggle-product" data-product-id="${escapeHtml(product.id)}">${product.visible === false ? "Show product" : "Hide product"}</button><button type="button" data-action="toggle-sold" data-product-id="${escapeHtml(product.id)}">${product.sold === true ? "Mark available" : "Mark sold"}</button><button class="delete-product" type="button" data-action="delete-product" data-product-id="${escapeHtml(product.id)}">Delete</button></div></div>`;
    }).join("");
}

// Limit concurrent base64 reads so a slow link stays responsive.
function queueImageRead(read, urgent = false) {
    return new Promise((resolve, reject) => {
        const job = { read, resolve, reject };
        if (urgent) imageQueue.unshift(job);
        else imageQueue.push(job);
        drainImageQueue();
    });
}

function drainImageQueue() {
    while (activeImageReads < (saveData ? 2 : 4) && imageQueue.length) {
        const { read, resolve, reject } = imageQueue.shift();
        activeImageReads += 1;
        Promise.resolve().then(read).then(resolve, reject).finally(() => {
            activeImageReads -= 1;
            drainImageQueue();
        });
    }
}

const imageObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
        const id = entry.target.dataset.productId;
        if (!entry.isIntersecting) { cardsInView.delete(id); continue; }
        cardsInView.add(id);
        const product = products.find((item) => item.id === id);
        if (product) hydrateProductImages(product);
    }
}, { rootMargin: saveData ? "0px" : "200px" }) : null;

function hydrateProductImages(product, force = false) {
    if (!hasLiveProducts || (!force && !cardsInView.has(product.id))) return;
    const index = productImageIndexes.get(product.id) || 0;
    const entries = galleryEntriesForProduct(product);
    entries.forEach((entry, imageIndex) => {
        if (!entry.imageId || entry.thumbnail || entry.full) return;
        // Old records have no preview: fetch only the selected full image, never the whole folder.
        if (!entry.hasPreview && imageIndex !== index) return;
        if ((saveData || force) && imageIndex !== index) return;
        if (force) {
            const button = cardNodes.get(product.id)?.querySelector(".product-image-button");
            button?.classList.remove("image-has-error");
            button?.classList.add("is-image-loading");
            button?.setAttribute("aria-busy", "true");
        }
        const loader = entry.hasPreview && !force ? loadPreview(product, imageIndex) : loadFullImage(product, imageIndex);
        loader.then((source) => {
            if (!products.includes(product)) return;
            if (source) refreshProduct(product);
            else if ((productImageIndexes.get(product.id) || 0) === imageIndex) {
                const button = cardNodes.get(product.id)?.querySelector(".product-image-button");
                button?.classList.remove("is-image-loading");
                button?.classList.add("image-has-error");
                button?.setAttribute("aria-busy", "false");
                scheduleSplashReveal();
            }
        });
    });
}

async function loadPreview(product, imageIndex) {
    const entry = galleryEntriesForProduct(product)[imageIndex];
    if (!entry?.imageId || entry.thumbnail) return entry?.thumbnail || "";
    const key = `${product.id}/${entry.imageId}`;
    if (!previewLoads.has(key)) {
        const revision = productRevision.get(product.id);
        const request = queueImageRead(async () => {
            if (productRevision.get(product.id) !== revision) return "";
            const snapshot = await get(ref(database, `${IMAGES_PATH}/${key}/thumbnailDataUrl`));
            const source = snapshot.val();
            if (typeof source !== "string" || !source) throw new Error("Preview unavailable");
            if (productRevision.get(product.id) !== revision) return "";
            storedPreviews.set(key, source);
            return source;
        });
        previewLoads.set(key, request);
        request.finally(() => { if (previewLoads.get(key) === request) previewLoads.delete(key); }).catch(() => {});
    }
    try { return await previewLoads.get(key); }
    catch { return ""; } // Retrying the card or reconnecting starts a fresh request.
}

function invalidateChangedImages(nextProducts) {
    const nextRevisions = new Map(nextProducts.map((product) => [product.id, JSON.stringify([product.imagesUpdatedAt ?? product.updatedAt, product.imageIds, product.thumbnailUrls, product.previewImageIds])]));
    for (const [id, revision] of productRevision) {
        if (nextRevisions.get(id) === revision) continue;
        for (const cache of [storedImages, storedPreviews, fullImageLoads, previewLoads]) {
            for (const key of cache.keys()) if (key.startsWith(`${id}/`)) cache.delete(key);
        }
    }
    productRevision = nextRevisions;
}

async function startGalleryListener() {
    try {
        await ensureDatabase();
        if (productsUnsubscribe) productsUnsubscribe();
        productsUnsubscribe = onValue(ref(database, PRODUCTS_PATH), (snapshot) => {
            const raw = snapshot.val() || {};
            const nextProducts = Object.entries(raw)
                .map(([id, product]) => ({ ...(product || {}), id }))
                .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
            invalidateChangedImages(nextProducts);
            products = nextProducts;
            hasLiveProducts = true;
            renderProducts();
            hideLoadingScreen();
            $("gallery-retry").classList.add("is-hidden");
            showNotice($("gallery-notice"), "");
            cachePublicProducts();
            for (const product of products) if (cardsInView.has(product.id)) hydrateProductImages(product);
        }, galleryLoadFailed);
    } catch (error) { galleryLoadFailed(error); }
}

function galleryLoadFailed(error) {
    console.error("Gallery loading failed:", error);
    hideLoadingScreen();
    window.dismissGallerySplash();
    showNotice($("gallery-notice"), products.length ? "Showing saved products. We could not check the latest prices and availability. Please retry." : "The gallery could not connect. Check your connection and retry.", "error");
    $("gallery-retry").classList.remove("is-hidden");
}

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read the image file."));
        reader.readAsDataURL(file);
    });
}

function dataUrlBytes(dataUrl) {
    const encoded = String(dataUrl).split(",")[1] || "";
    return Math.ceil(encoded.length * 3 / 4);
}

function loadImageForCompression(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`Could not open ${file.name || "the image"}.`));
        };
        image.src = objectUrl;
    });
}

async function compressImage(file) {
    const image = await loadImageForCompression(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error(`Could not determine the size of ${file.name || "the image"}.`);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) throw new Error("Your browser cannot compress this image.");
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    let scale = Math.min(1, 5000 / Math.max(sourceWidth, sourceHeight));
    let quality = 0.92;
    let bestDataUrl = "";

    for (let attempt = 0; attempt < 12; attempt += 1) {
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (outputType === "image/jpeg") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(outputType, quality);
        bestDataUrl = dataUrl;
        if (dataUrlBytes(dataUrl) <= TARGET_IMAGE_BYTES) return dataUrl;
        if (outputType === "image/png" || attempt % 2 === 1) {
            scale *= 0.84;
        } else {
            quality = Math.max(0.55, quality - 0.08);
        }
    }
    if (bestDataUrl && dataUrlBytes(bestDataUrl) <= MAX_IMAGE_BYTES) return bestDataUrl;
    throw new Error(`${file.name || "This image"} could not be compressed below 6 MB.`);
}

async function createThumbnail(file) {
    const image = await loadImageForCompression(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Could not determine the image size.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot create an image preview.");
    let scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    let quality = 0.76;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
            context.globalCompositeOperation = "destination-over";
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.globalCompositeOperation = "source-over";
            dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrlBytes(dataUrl) <= 64 * 1024) return dataUrl;
        scale *= 0.8;
        quality = Math.max(0.5, quality - 0.06);
    }
    throw new Error("Could not create a small image preview. Please choose a smaller image.");
}

async function encodeImage(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Please choose image files only.");
    const [dataUrl, thumbnailDataUrl] = await Promise.all([
        file.size <= MAX_IMAGE_BYTES ? readAsDataUrl(file) : compressImage(file),
        createThumbnail(file),
    ]);
    return { dataUrl, thumbnailDataUrl, compressed: file.size > MAX_IMAGE_BYTES };
}

async function optimizeOlderImages() {
    if (!isAdmin || !currentUser || optimizingImages) return;
    const user = currentUser;
    const button = $("optimize-images-button");
    optimizingImages = true;
    setBusy(button, true, "Optimizing images…", "Optimize older images");
    let optimized = 0;
    try {
        // This runs only on an explicit admin click. Process one image at a time
        // to avoid simultaneous multi-megabyte downloads and canvas allocations.
        for (const product of [...products]) {
            const entries = galleryEntriesForProduct(product);
            if (!entries.some((entry) => entry.imageId && !entry.hasPreview)) continue;
            const changes = {};
            const previewIds = new Set(product.previewImageIds || []);
            for (const [index, entry] of entries.entries()) {
                if (!entry.imageId || entry.hasPreview) continue;
                if (currentUser !== user || !isAdmin) throw new Error("Sign in again to continue optimizing images.");
                showNotice($("optimize-images-notice"), `Optimizing ${product.title || "product"}, image ${index + 1}… Keep this page open.`);
                const source = entry.thumbnail || await loadFullImage(product, index);
                if (!source.startsWith("data:image/")) throw new Error("An older image could not be loaded. Please retry.");
                const blob = await (await fetch(source)).blob();
                changes[`${IMAGES_PATH}/${product.id}/${entry.imageId}/thumbnailDataUrl`] = await createThumbnail(blob);
                previewIds.add(entry.imageId);
            }
            const latest = (await get(ref(database, `${PRODUCTS_PATH}/${product.id}`))).val();
            if (!latest || latest.updatedAt !== product.updatedAt) throw new Error("A product changed during optimization. Please retry to use the latest version.");
            if (currentUser !== user || !isAdmin) throw new Error("Sign in again to continue optimizing images.");
            changes[`${PRODUCTS_PATH}/${product.id}/previewImageIds`] = [...previewIds];
            changes[`${PRODUCTS_PATH}/${product.id}/thumbnailUrls`] = null;
            changes[`${PRODUCTS_PATH}/${product.id}/imagesUpdatedAt`] = serverTimestamp();
            changes[`${PRODUCTS_PATH}/${product.id}/updatedAt`] = serverTimestamp();
            // Publish previews and their metadata together; original images are preserved.
            await update(ref(database), changes);
            optimized += 1;
        }
        showNotice($("optimize-images-notice"), `Optimized ${optimized} ${optimized === 1 ? "product" : "products"}. Small previews will load as visitors scroll.`, "success");
    } catch (error) {
        showNotice($("optimize-images-notice"), `${optimized} products optimized. ${error.message || "Please retry to finish."}`, "error");
    } finally {
        optimizingImages = false;
        setBusy(button, false, "Optimizing images…", "Optimize older images");
        renderAdminProducts();
    }
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function previewImages() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    const files = Array.from($("product-images").files || []);
    if (!files.length) {
        $("admin-preview").innerHTML = '<span class="admin-meta">Small previews load first; detailed images load when opened. Images over 6 MB are compressed before upload.</span>';
        return;
    }
    const grid = document.createElement("div");
    grid.className = "admin-preview-grid";
    files.forEach((file) => {
        const url = URL.createObjectURL(file);
        previewObjectUrls.push(url);
        const tile = document.createElement("div");
        tile.className = "preview-tile";
        const image = document.createElement("img");
        image.src = url;
        image.alt = file.name || "Selected product preview";
        const label = document.createElement("span");
        label.textContent = `${file.name || "Image"} · ${formatBytes(file.size)}${file.size > MAX_IMAGE_BYTES ? " · will compress" : ""}`;
        tile.append(image, label);
        grid.appendChild(tile);
    });
    $("admin-preview").replaceChildren(grid);
}

function previewExistingProduct(product) {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    const entries = galleryEntriesForProduct(product);
    if (!entries.length) {
        $("admin-preview").innerHTML = '<span class="admin-meta">No current images. Select files or add an image URL to attach images.</span>';
        return;
    }
    const grid = document.createElement("div");
    grid.className = "admin-preview-grid";
    entries.forEach((entry, index) => {
        const tile = document.createElement("div");
        tile.className = "preview-tile";
        const image = document.createElement("img");
        image.src = imageSourceForEntry(entry);
        image.loading = "lazy";
        image.alt = `Current image ${index + 1}`;
        const label = document.createElement("span");
        label.textContent = `Current image ${index + 1}`;
        tile.append(image, label);
        if (entry.imageId) {
            const replaceLabel = document.createElement("label");
            replaceLabel.className = "replace-image-control";
            replaceLabel.textContent = "Replace this image";
            const replaceInput = document.createElement("input");
            replaceInput.type = "file";
            replaceInput.accept = "image/*";
            replaceInput.dataset.replaceImageIndex = String(index);
            replaceInput.setAttribute("aria-label", `Replace image ${index + 1}`);
            replaceLabel.appendChild(replaceInput);
            tile.appendChild(replaceLabel);
        }
        grid.appendChild(tile);
    });
    $("admin-preview").replaceChildren(grid);
}

function resetProductForm() {
    editingProductId = null;
    $("product-form").reset();
    $("product-images").disabled = false;
    $("product-image-url").disabled = false;
    $("product-visible").checked = true;
    $("product-sold").checked = false;
    $("add-product-button").textContent = "Add product";
    $("cancel-edit-button").classList.add("is-hidden");
    previewImages();
}

function editProduct(productId) {
    if (!isAdmin) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    editingProductId = productId;
    $("product-title").value = product.title || "";
    $("product-description").value = product.description || "";
    $("product-base-price").value = Number.isFinite(Number(product.basePrice)) ? String(product.basePrice) : "";
    $("product-image-url").value = product.imageUrl || "";
    $("product-images").value = "";
    $("product-images").disabled = true;
    $("product-image-url").disabled = Array.isArray(product.imageIds) && product.imageIds.length > 0;
    $("product-visible").checked = product.visible !== false;
    $("product-sold").checked = product.sold === true;
    $("add-product-button").textContent = "Save changes";
    $("cancel-edit-button").classList.remove("is-hidden");
    previewExistingProduct(product);
    showNotice($("admin-notice"), "Editing this product. Select new images only if you want to replace the current images.");
    $("product-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

function replacementFilesForEdit() {
    return [...document.querySelectorAll("[data-replace-image-index]")]
        .map((input) => ({ index: Number(input.dataset.replaceImageIndex), file: input.files?.[0] }))
        .filter((replacement) => Number.isInteger(replacement.index) && replacement.file);
}

async function addProduct(event) {
    event.preventDefault();
    if (!isAdmin || !currentUser) return;
    const wasEditing = Boolean(editingProductId);
    const editingProduct = products.find((item) => item.id === editingProductId);
    if (wasEditing && !editingProduct) {
        resetProductForm();
        showNotice($("admin-notice"), "That product is no longer available.", "error");
        return;
    }
    const title = $("product-title").value.trim();
    const description = $("product-description").value.trim();
    const files = wasEditing ? [] : Array.from($("product-images").files || []);
    const imageUrl = wasEditing
        ? (!Array.isArray(editingProduct?.imageIds) || !editingProduct.imageIds.length ? $("product-image-url").value.trim() : "")
        : $("product-image-url").value.trim();
    const replacements = wasEditing ? replacementFilesForEdit() : [];
    const basePriceInput = $("product-base-price").value.trim();
    const basePrice = basePriceInput === "" ? null : Number(basePriceInput);
    const visible = $("product-visible").checked;
    const sold = $("product-sold").checked;
    const button = $("add-product-button");
    if (!title) {
        showNotice($("admin-notice"), "Add a product title.", "error");
        return;
    }
    if (!wasEditing && !files.length && !imageUrl) {
        showNotice($("admin-notice"), "Add at least one image or paste an image URL.", "error");
        return;
    }
    if (basePriceInput !== "" && (!Number.isFinite(basePrice) || basePrice < 0)) {
        showNotice($("admin-notice"), "Enter a valid base price or leave it empty.", "error");
        return;
    }
    const idleText = wasEditing ? "Save changes" : "Add product";
    setBusy(button, true, "Preparing images…", idleText);
    showNotice($("admin-notice"), wasEditing ? "Saving product changes…" : "Compressing large images and saving the product…");
    let newImageIds = [];
    let productIdForCleanup = null;
    try {
        const productId = wasEditing ? editingProduct.id : push(ref(database, PRODUCTS_PATH)).key;
        if (!productId) throw new Error("Could not create the product record.");
        productIdForCleanup = productId;
        const oldImageIds = wasEditing && Array.isArray(editingProduct.imageIds) ? editingProduct.imageIds : [];
        const oldImageUrls = wasEditing && Array.isArray(editingProduct.imageUrls) ? editingProduct.imageUrls : [];
        let imageIds = wasEditing && Array.isArray(editingProduct.imageIds) ? [...editingProduct.imageIds] : [];
        let previewImageIds = wasEditing && Array.isArray(editingProduct.previewImageIds) ? [...editingProduct.previewImageIds] : [];
        let thumbnailUrls = wasEditing && Array.isArray(editingProduct.thumbnailUrls) ? [...editingProduct.thumbnailUrls] : [];
        let savedImageUrl = wasEditing ? editingProduct.imageUrl || "" : "";
        let replacedImages = false;
        let replacedImageSet = false;
        if (wasEditing && imageUrl && oldImageIds.length === 0) {
            imageIds = [];
            thumbnailUrls = [];
            savedImageUrl = imageUrl;
            replacedImages = true;
            replacedImageSet = true;
        } else if (wasEditing) {
            const currentEntries = galleryEntriesForProduct(editingProduct);
            const encodedReplacements = await Promise.all(replacements.map((replacement) => encodeImage(replacement.file)));
            await Promise.all(encodedReplacements.map((image, replacementIndex) => {
                const replacement = replacements[replacementIndex];
                const entry = currentEntries[replacement.index];
                if (!entry?.imageId || replacement.index >= imageIds.length) {
                    throw new Error("Only uploaded images can be replaced individually. Add a new product image instead.");
                }
                thumbnailUrls[replacement.index] = "";
                if (!previewImageIds.includes(entry.imageId)) previewImageIds.push(entry.imageId);
                return set(ref(database, `${IMAGES_PATH}/${productId}/${entry.imageId}`), {
                    dataUrl: image.dataUrl,
                    thumbnailDataUrl: image.thumbnailDataUrl,
                    name: replacement.file.name,
                    type: image.dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : replacement.file.type,
                    index: replacement.index,
                    originalBytes: replacement.file.size,
                    storedBytes: dataUrlBytes(image.dataUrl),
                    compressed: image.compressed,
                });
            }));
            replacedImages = replacements.length > 0;
        } else if (files.length) {
            const encodedImages = await Promise.all(files.map((file) => encodeImage(file)));
            imageIds = files.map(() => push(ref(database, `${IMAGES_PATH}/${productId}`)).key);
            newImageIds = imageIds;
            if (imageIds.some((imageId) => !imageId)) throw new Error("Could not create image records.");
            await Promise.all(encodedImages.map((image, index) => set(ref(database, `${IMAGES_PATH}/${productId}/${imageIds[index]}`), {
                dataUrl: image.dataUrl,
                thumbnailDataUrl: image.thumbnailDataUrl,
                name: files[index].name,
                type: image.dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : files[index].type,
                index,
                originalBytes: files[index].size,
                storedBytes: dataUrlBytes(image.dataUrl),
                compressed: image.compressed,
            })));
            thumbnailUrls = [];
            previewImageIds = [...imageIds];
            savedImageUrl = "";
            replacedImages = true;
            replacedImageSet = true;
        } else if (imageUrl) {
            imageIds = [];
            thumbnailUrls = [];
            savedImageUrl = imageUrl;
            replacedImages = true;
            replacedImageSet = true;
        }
        const product = {
            id: productId,
            title,
            description,
            imageUrl: savedImageUrl,
            imageIds,
            thumbnailUrls,
            previewImageIds: previewImageIds.filter((id) => imageIds.includes(id)),
            visible,
            sold,
            createdAt: wasEditing ? editingProduct.createdAt : serverTimestamp(),
            updatedAt: serverTimestamp(),
            imagesUpdatedAt: replacedImages ? serverTimestamp() : editingProduct?.imagesUpdatedAt ?? editingProduct?.updatedAt ?? serverTimestamp(),
            createdBy: wasEditing ? editingProduct.createdBy || currentUser.uid : currentUser.uid,
            createdByName: wasEditing ? editingProduct.createdByName || currentUser.displayName || currentUser.email || "Admin" : currentUser.displayName || currentUser.email || "Admin",
        };
        if (basePriceInput !== "") product.basePrice = basePrice;
        else if (wasEditing) product.basePrice = null;
        if (wasEditing && !replacedImageSet && oldImageUrls.length) product.imageUrls = oldImageUrls;
        await set(ref(database, `${PRODUCTS_PATH}/${productId}`), product);
        if (wasEditing && replacedImages && oldImageIds.length) {
            await Promise.all(oldImageIds.filter((imageId) => !imageIds.includes(imageId)).map((imageId) => remove(ref(database, `${IMAGES_PATH}/${productId}/${imageId}`))));
        }
        resetProductForm();
        showNotice($("admin-notice"), wasEditing ? "Product changes saved." : "Product added to the gallery.", "success");
    } catch (error) {
        console.error(error);
        if (newImageIds.length) {
            await Promise.all(newImageIds.filter(Boolean).map((imageId) => remove(ref(database, `${IMAGES_PATH}/${productIdForCleanup}/${imageId}`)).catch(() => undefined)));
        }
        const message = String(error?.message || "");
        showNotice($("admin-notice"), message.toLowerCase().includes("permission_denied") ? "Firebase rejected this admin write. Check the gallery database rules." : message || (wasEditing ? "Could not save the product changes." : "Could not add the product."), "error");
    } finally {
        setBusy(button, false, "Preparing images…", editingProductId ? "Save changes" : "Add product");
    }
}

async function toggleProduct(productId) {
    if (!isAdmin) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    try {
        await update(ref(database, `${PRODUCTS_PATH}/${productId}`), { visible: product.visible === false, updatedAt: serverTimestamp() });
        showNotice($("admin-notice"), product.visible === false ? "Product is visible to visitors." : "Product is hidden from visitors.", "success");
    } catch (error) {
        console.error(error);
        showNotice($("admin-notice"), error.message || "Could not update product visibility.", "error");
    }
}

async function toggleSold(productId) {
    if (!isAdmin) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const sold = product.sold !== true;
    try {
        await update(ref(database, `${PRODUCTS_PATH}/${productId}`), { sold, updatedAt: serverTimestamp() });
        showNotice($("admin-notice"), sold ? "Product marked as sold." : "Product marked as available.", "success");
    } catch (error) {
        console.error(error);
        showNotice($("admin-notice"), error.message || "Could not update the sold status.", "error");
    }
}

async function deleteProduct(productId, button) {
    if (!isAdmin) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const title = product.title || "this product";
    if (!window.confirm(`Delete “${title}” and all of its images? This cannot be undone.`)) return;
    if (button) {
        button.disabled = true;
        button.textContent = "Deleting…";
    }
    try {
        const imageIds = Array.isArray(product.imageIds) ? product.imageIds : [];
        await Promise.all(imageIds.map((imageId) => remove(ref(database, `${IMAGES_PATH}/${productId}/${imageId}`))));
        await remove(ref(database, `${PRODUCTS_PATH}/${productId}`));
        [...fullImageLoads.keys()].filter((key) => key.startsWith(`${productId}/`)).forEach((key) => fullImageLoads.delete(key));
        productImageIndexes.delete(productId);
        showNotice($("admin-notice"), "Product deleted from the gallery.", "success");
    } catch (error) {
        console.error(error);
        if (button) {
            button.disabled = false;
            button.textContent = "Delete";
        }
        showNotice($("admin-notice"), error.message || "Could not delete the product.", "error");
    }
}

function changeProductImage(productId, direction) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const images = galleryEntriesForProduct(product);
    if (images.length < 2) return;
    const currentIndex = productImageIndexes.get(productId) || 0;
    productImageIndexes.set(productId, (currentIndex + direction + images.length) % images.length);
    refreshProduct(product);
}

async function loadFullImage(product, imageIndex) {
    const entry = galleryEntriesForProduct(product)[imageIndex];
    if (!entry?.imageId || entry.full) return entry?.full || entry?.url || entry?.thumbnail || "";
    const key = `${product.id}/${entry.imageId}`;
    if (!fullImageLoads.has(key)) {
        const revision = productRevision.get(product.id);
        const request = queueImageRead(async () => {
            if (productRevision.get(product.id) !== revision) return "";
            const snapshot = await get(ref(database, `${IMAGES_PATH}/${key}/dataUrl`));
            const source = snapshot.val();
            if (typeof source !== "string" || !source) throw new Error("Image unavailable");
            if (productRevision.get(product.id) !== revision) return "";
            storedImages.set(key, source);
            return source;
        }, Boolean(lightboxProduct));
        fullImageLoads.set(key, request);
        request.finally(() => { if (fullImageLoads.get(key) === request) fullImageLoads.delete(key); }).catch(() => {});
    }
    try {
        const source = await fullImageLoads.get(key);
        if (lightboxProduct?.id === product.id && lightboxIndex === imageIndex && source) {
            lightboxImages[imageIndex] = source;
            renderLightbox();
        }
        return source;
    } catch (error) {
        console.warn("Could not load gallery image:", error);
        if (lightboxProduct?.id === product.id && lightboxIndex === imageIndex) {
            $("lightbox-caption").textContent = "The detailed image could not load. Close and reopen to retry.";
        }
        return "";
    }
}

async function openLightbox(product, imageIndex) {
    const entries = galleryEntriesForProduct(product);
    if (!entries.length) return;
    lightboxProduct = product;
    lightboxImages = entries.map(imageSourceForEntry);
    lightboxIndex = Math.min(Math.max(imageIndex, 0), entries.length - 1);
    lightboxZoom = 1;
    lightboxOffsetX = 0;
    lightboxOffsetY = 0;
    $("lightbox-title").textContent = product.title || "Image preview";
    $("lightbox").classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
    renderLightbox();
    $("lightbox-close").focus();
    await loadFullImage(product, lightboxIndex);
}

function applyLightboxTransform() {
    if (lightboxZoom <= 1) {
        lightboxOffsetX = 0;
        lightboxOffsetY = 0;
    } else {
        clampLightboxOffset();
    }
    $("lightbox-image").style.transform = `translate(${lightboxOffsetX}px, ${lightboxOffsetY}px) scale(${lightboxZoom})`;
    $("lightbox-stage").classList.toggle("is-zoomed", lightboxZoom > 1);
    $("zoom-reset").textContent = `${Math.round(lightboxZoom * 100)}%`;
}

function renderLightbox() {
    const image = $("lightbox-image");
    const nextSource = lightboxImages[lightboxIndex] || "";
    if (image.getAttribute("src") !== nextSource) {
        image.src = nextSource;
        image.decoding = "async";
        image.fetchPriority = "high";
    }
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    $("lightbox-caption").textContent = isTouchDevice
        ? `${lightboxImages.length > 1 ? `${lightboxIndex + 1} / ${lightboxImages.length} · ` : ""}Pinch to zoom · drag to move · swipe to change`
        : lightboxImages.length > 1 ? `${lightboxIndex + 1} / ${lightboxImages.length} · Use +/− or the mouse wheel to zoom · drag to pan` : "Use +/− or the mouse wheel to zoom · drag to pan when zoomed";
    $("lightbox-previous").disabled = lightboxImages.length < 2;
    $("lightbox-next").disabled = lightboxImages.length < 2;
    applyLightboxTransform();
}

function closeLightbox() {
    $("lightbox").classList.add("is-hidden");
    document.body.style.overflow = "";
    lightboxProduct = null;
    lightboxImages = [];
    lightboxOffsetX = 0;
    lightboxOffsetY = 0;
    pointerStart = null;
    $("lightbox-stage").classList.remove("is-panning");
}

function changeLightboxImage(direction) {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
    lightboxZoom = 1;
    lightboxOffsetX = 0;
    lightboxOffsetY = 0;
    renderLightbox();
    if (lightboxProduct) loadFullImage(lightboxProduct, lightboxIndex);
}

function lightboxPanLimits() {
    const stage = $("lightbox-stage");
    const image = $("lightbox-image");
    const imageWidth = image.clientWidth || stage.clientWidth;
    const imageHeight = image.clientHeight || stage.clientHeight;
    return {
        x: Math.max(0, (imageWidth * lightboxZoom - stage.clientWidth) / 2),
        y: Math.max(0, (imageHeight * lightboxZoom - stage.clientHeight) / 2),
    };
}

function clampLightboxOffset() {
    const limits = lightboxPanLimits();
    lightboxOffsetX = Math.min(limits.x, Math.max(-limits.x, lightboxOffsetX));
    lightboxOffsetY = Math.min(limits.y, Math.max(-limits.y, lightboxOffsetY));
}

function setLightboxZoom(nextZoom, anchorX = null, anchorY = null) {
    const previousZoom = lightboxZoom;
    lightboxZoom = Math.min(4, Math.max(1, Number(nextZoom.toFixed(2))));
    if (lightboxZoom === previousZoom) return;
    if (anchorX !== null && anchorY !== null && previousZoom > 0) {
        const bounds = $("lightbox-stage").getBoundingClientRect();
        const pointX = anchorX - (bounds.left + bounds.width / 2);
        const pointY = anchorY - (bounds.top + bounds.height / 2);
        const ratio = lightboxZoom / previousZoom;
        lightboxOffsetX = pointX + (lightboxOffsetX - pointX) * ratio;
        lightboxOffsetY = pointY + (lightboxOffsetY - pointY) * ratio;
    }
    applyLightboxTransform();
}

function adjustZoom(amount, anchorX = null, anchorY = null) {
    setLightboxZoom(lightboxZoom + amount, anchorX, anchorY);
}

function touchDistance(touches) {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function handleLightboxTouchStart(event) {
    if (event.touches.length === 2) {
        touchStart = null;
        pinchStartDistance = touchDistance(event.touches);
        pinchStartZoom = lightboxZoom;
        event.preventDefault();
        return;
    }
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchStart = {
            x: touch.clientX,
            y: touch.clientY,
            offsetX: lightboxOffsetX,
            offsetY: lightboxOffsetY,
            startedAt: Date.now(),
        };
        event.preventDefault();
    }
}

function handleLightboxTouchMove(event) {
    if (event.touches.length === 2 && pinchStartDistance) {
        lightboxZoom = Math.min(4, Math.max(1, Number((pinchStartZoom * touchDistance(event.touches) / pinchStartDistance).toFixed(2))));
        if (lightboxZoom === 1) {
            lightboxOffsetX = 0;
            lightboxOffsetY = 0;
        }
        applyLightboxTransform();
        event.preventDefault();
        return;
    }
    if (event.touches.length === 1 && touchStart) {
        const touch = event.touches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        if (lightboxZoom > 1) {
            const limits = lightboxPanLimits();
            lightboxOffsetX = Math.min(limits.x, Math.max(-limits.x, touchStart.offsetX + deltaX));
            lightboxOffsetY = Math.min(limits.y, Math.max(-limits.y, touchStart.offsetY + deltaY));
            applyLightboxTransform();
        }
        event.preventDefault();
    }
}

function handleLightboxTouchEnd(event) {
    if (event.touches.length > 0) return;
    if (touchStart && lightboxZoom === 1 && event.changedTouches.length) {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const elapsed = Date.now() - touchStart.startedAt;
        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && elapsed < 800) {
            changeLightboxImage(deltaX < 0 ? 1 : -1);
        }
    }
    touchStart = null;
    pinchStartDistance = 0;
}

function handleLightboxPointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0 || lightboxZoom <= 1 || event.target.closest("button")) return;
    pointerStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offsetX: lightboxOffsetX,
        offsetY: lightboxOffsetY,
    };
    $("lightbox-stage").classList.add("is-panning");
    $("lightbox-stage").setPointerCapture(event.pointerId);
    event.preventDefault();
}

function handleLightboxPointerMove(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const limits = lightboxPanLimits();
    lightboxOffsetX = Math.min(limits.x, Math.max(-limits.x, pointerStart.offsetX + event.clientX - pointerStart.x));
    lightboxOffsetY = Math.min(limits.y, Math.max(-limits.y, pointerStart.offsetY + event.clientY - pointerStart.y));
    applyLightboxTransform();
    event.preventDefault();
}

function handleLightboxPointerUp(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const stage = $("lightbox-stage");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    stage.classList.remove("is-panning");
    pointerStart = null;
}

function handleLightboxWheel(event) {
    event.preventDefault();
    const amount = Math.min(0.35, Math.max(0.06, Math.abs(event.deltaY) / 450));
    adjustZoom(event.deltaY < 0 ? amount : -amount, event.clientX, event.clientY);
}

function handleLightboxDoubleClick(event) {
    if (event.target.closest("button")) return;
    const nextZoom = lightboxZoom > 1 ? 1 : 2;
    setLightboxZoom(nextZoom, event.clientX, event.clientY);
}

function handleGalleryClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const productId = target.dataset.productId;
    const action = target.dataset.action;
    if (action === "edit-product") {
        editProduct(productId);
        return;
    }
    if (action === "toggle-product") {
        toggleProduct(productId);
        return;
    }
    if (action === "toggle-sold") {
        toggleSold(productId);
        return;
    }
    if (action === "delete-product") {
        deleteProduct(productId, target);
        return;
    }
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const imageIndex = Number(target.dataset.imageIndex || 0);
    if (action === "select-image") {
        productImageIndexes.set(productId, imageIndex);
        refreshProduct(product);
    } else if (action === "retry-image") {
        const image = target.querySelector("img");
        if (image) {
            target.classList.remove("image-has-error");
            target.classList.add("is-image-loading");
            target.setAttribute("aria-busy", "true");
            image.src = image.getAttribute("src");
        } else hydrateProductImages(product, true);
    } else if (action === "previous-image") {
        changeProductImage(productId, -1);
    } else if (action === "next-image") {
        changeProductImage(productId, 1);
    } else if (action === "zoom") {
        openLightbox(product, imageIndex);
    }
}

$("login-button").addEventListener("click", async () => {
    try { localStorage.setItem(AUTH_HINT_KEY, "1"); } catch {}
    showNotice($("gallery-notice"), "Opening optional admin sign-in…");
    try {
        const api = await ensureAuth();
        await api.signInWithPopup(auth, provider);
    } catch (error) {
        console.error(error);
        if (["auth/popup-blocked", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(error.code)) {
            showNotice($("gallery-notice"), "Switching to secure sign-in…");
            const api = authApi || await ensureAuth();
            await api.signInWithRedirect(auth, provider);
        } else {
            showNotice($("gallery-notice"), error.message || "Sign-in did not complete.", "error");
        }
    }
});
$("signout-button").addEventListener("click", async () => {
    if (authApi && auth) {
        await authApi.signOut(auth);
        try { localStorage.removeItem(AUTH_HINT_KEY); } catch {}
    }
});
$("product-form").addEventListener("submit", addProduct);
$("optimize-images-button").addEventListener("click", optimizeOlderImages);
$("product-images").addEventListener("change", previewImages);
$("cancel-edit-button").addEventListener("click", () => {
    resetProductForm();
    showNotice($("admin-notice"), "Edit cancelled.");
});
$("gallery-grid").addEventListener("click", handleGalleryClick);
$("gallery-grid").addEventListener("load", (event) => {
    if (event.target instanceof HTMLImageElement) settleProductImage(event.target, true);
}, true);
$("gallery-grid").addEventListener("error", (event) => {
    if (event.target instanceof HTMLImageElement) settleProductImage(event.target, false);
}, true);
$("admin-products").addEventListener("click", handleGalleryClick);
$("lightbox-close").addEventListener("click", closeLightbox);
$("lightbox-previous").addEventListener("click", () => changeLightboxImage(-1));
$("lightbox-next").addEventListener("click", () => changeLightboxImage(1));
$("zoom-in").addEventListener("click", () => adjustZoom(0.25));
$("zoom-out").addEventListener("click", () => adjustZoom(-0.25));
$("zoom-reset").addEventListener("click", () => { lightboxZoom = 1; lightboxOffsetX = 0; lightboxOffsetY = 0; renderLightbox(); });
$("lightbox-stage").addEventListener("wheel", handleLightboxWheel, { passive: false });
$("lightbox-stage").addEventListener("dblclick", handleLightboxDoubleClick);
$("lightbox-stage").addEventListener("pointerdown", handleLightboxPointerDown);
$("lightbox-stage").addEventListener("pointermove", handleLightboxPointerMove);
$("lightbox-stage").addEventListener("pointerup", handleLightboxPointerUp);
$("lightbox-stage").addEventListener("pointercancel", handleLightboxPointerUp);
$("lightbox-stage").addEventListener("touchstart", handleLightboxTouchStart, { passive: false });
$("lightbox-stage").addEventListener("touchmove", handleLightboxTouchMove, { passive: false });
$("lightbox-stage").addEventListener("touchend", handleLightboxTouchEnd, { passive: false });
$("lightbox-stage").addEventListener("touchcancel", handleLightboxTouchEnd, { passive: false });
$("lightbox").addEventListener("click", (event) => { if (event.target === $("lightbox")) closeLightbox(); });
document.addEventListener("keydown", (event) => {
    if ($("lightbox").classList.contains("is-hidden")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") changeLightboxImage(-1);
    if (event.key === "ArrowRight") changeLightboxImage(1);
    if (event.key === "+" || event.key === "=") adjustZoom(0.25);
    if (event.key === "-") adjustZoom(-0.25);
});

async function handleAuthStateChanged(user) {
    currentUser = user;
    if (!user) {
        isAdmin = false;
        displayUser(null);
        updateAdminVisibility();
        $("login-button").classList.remove("is-hidden");
        $("signout-button").classList.add("is-hidden");
        renderProducts();
        return;
    }
    displayUser(user);
    const nextIsAdmin = await checkAdmin(user);
    if (currentUser !== user) return;
    isAdmin = nextIsAdmin;
    $("login-button").classList.add("is-hidden");
    $("signout-button").classList.remove("is-hidden");
    updateAdminVisibility();
    renderProducts();
}

restoreCachedProducts();
startGalleryListener();
scheduleAuthBoot();
window.addEventListener("offline", () => {
    showNotice($("gallery-notice"), "You are offline. Prices and availability may have changed.");
});
window.addEventListener("online", () => {
    showNotice($("gallery-notice"), "Reconnecting and checking the latest products…");
    startGalleryListener();
});
