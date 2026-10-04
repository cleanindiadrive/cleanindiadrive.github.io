function showView(viewName) {
        const homeView = document.getElementById("view-home");
        const dashView = document.getElementById("view-dashboard");
        const appRoot = document.getElementById("sillysense-oodopage");
        if (!homeView || !dashView) return;

        if (viewName === "dashboard") {
            homeView.classList.add("is-hidden");
            dashView.classList.remove("is-hidden");
            appRoot?.classList.add("dashboard-page");
            if (window.location.hash !== "#dashboard") {
                window.location.hash = "#dashboard";
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            dashView.classList.add("is-hidden");
            homeView.classList.remove("is-hidden");
            appRoot?.classList.remove("dashboard-page");
            if (window.location.hash === "#dashboard") {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }
    window.showView = showView;

    window.addEventListener("hashchange", () => {
        if (window.location.hash === "#dashboard") {
            showView("dashboard");
        } else {
            showView("home");
        }
    });

    // Intercept navigation links between home & dashboard inside the bundle
    document.addEventListener("click", (e) => {
        const target = e.target.closest("a, button");
        if (!target) return;
        const href = target.getAttribute("href") || "";

        if (target.id === "account-link" || target.id === "subscription-account-link" || href === "#dashboard" || href === "user-dashboard.html" || href.includes("#dashboard")) {
            e.preventDefault();
            showView("dashboard");
        } else if (target.classList.contains("dashboard-home-link") || target.classList.contains("dashboard-nav-home") || (target.closest(".dashboard-header") && target.classList.contains("logo")) || href === "#home" || href === "index.html" || href.includes("#home")) {
            e.preventDefault();
            showView("home");
        }
    });

    // Initial Route Check
    const initialParams = new URLSearchParams(window.location.search);
    if (window.location.hash === "#dashboard" || initialParams.get("view") === "dashboard" || initialParams.get("preview") === "1") {
        showView("dashboard");
    } else {
        showView("home");
    }

    // Robust, fast loader dismissal with multiple triggers and failsafes
    function dismissLoader() {
        const loader = document.getElementById("page-loader");
        if (!loader) return;
        loader.classList.add("loader-hidden");
        setTimeout(function () {
            if (loader) loader.style.display = "none";
        }, 450);
    }

    if (document.readyState === "complete") {
        setTimeout(dismissLoader, 200);
    } else if (document.readyState === "interactive") {
        setTimeout(dismissLoader, 400);
    } else {
        document.addEventListener("DOMContentLoaded", function () {
            setTimeout(dismissLoader, 500);
        });
    }

    window.addEventListener("load", function () {
        setTimeout(dismissLoader, 300);
    });

    // Hard timeout failsafe: Never get stuck on loading screen
    setTimeout(dismissLoader, 1800);

    document.getElementById("page-loader")?.addEventListener("click", dismissLoader);

    // When this page is hosted inside an Odoo iframe, report the real content
    // height so the parent can remove the empty space below the footer.
    (function enableEmbeddedHeightSync() {
        if (window.parent === window) return;

        // Prevent the iframe's current viewport height from becoming the
        // page's minimum height. This is what allows the parent frame to
        // shrink again after an accordion/details panel is closed.
        document.getElementById("sillysense-oodopage")?.classList.add("is-embedded");

        let frameId = 0;
        const getDocumentBottom = (element) => {
            let bottom = 0;
            let current = element;
            while (current && current !== document.body) {
                bottom += current.offsetTop || 0;
                current = current.offsetParent;
            }
            return bottom + (element?.offsetHeight || 0);
        };

        const postHeight = () => {
            frameId = 0;
            const visibleViews = [...document.querySelectorAll(".page-view:not(.is-hidden)")];
            const visibleViewBottom = visibleViews.reduce(
                (max, view) => Math.max(max, getDocumentBottom(view)),
                0,
            );
            const visibleFooters = [...document.querySelectorAll("footer")]
                .filter((footer) => footer.getClientRects().length > 0);
            const footerBottom = visibleFooters.reduce(
                (max, footer) => Math.max(max, getDocumentBottom(footer)),
                0,
            );
            const height = Math.ceil(Math.max(1, visibleViewBottom, footerBottom));

            window.parent.postMessage({
                source: "sillysense-oodopage",
                type: "height",
                height,
            }, "*");
        };

        const scheduleHeightUpdate = () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(postHeight);
        };

        window.addEventListener("load", scheduleHeightUpdate);
        window.addEventListener("resize", scheduleHeightUpdate);
        document.addEventListener("DOMContentLoaded", scheduleHeightUpdate);

        // The browser does not consistently fire ResizeObserver for a
        // <details> panel whose content is removed from normal flow. Send a
        // fresh measurement whenever an accordion is opened or closed.
        document.addEventListener("toggle", scheduleHeightUpdate, true);
        document.addEventListener("click", (event) => {
            if (!event.target.closest?.("summary")) return;
            scheduleHeightUpdate();
            setTimeout(scheduleHeightUpdate, 80);
            setTimeout(scheduleHeightUpdate, 240);
        }, true);

        if (window.ResizeObserver) {
            new ResizeObserver(scheduleHeightUpdate).observe(document.body);
            new ResizeObserver(scheduleHeightUpdate).observe(document.documentElement);
        }
        if (window.MutationObserver) {
            new MutationObserver(scheduleHeightUpdate).observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ["class", "style"],
            });
        }

        [100, 500, 1000, 2000, 3500].forEach((delay) => {
            setTimeout(scheduleHeightUpdate, delay);
        });
    })();
