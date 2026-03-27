/**
 * IP-Analytics Tracker v2.0
 * Drop-in script to track page views.
 *
 * Usage:
 *   <script
 *     src="https://your-api.com/static/tracker.js"
 *     data-site-id="YOUR_SITE_ID"
 *     defer
 *   ></script>
 */
(function () {
    'use strict';

    const script = document.currentScript;
    const siteId = script && script.getAttribute('data-site-id');

    if (!siteId) {
        console.warn('[Analytics] Missing data-site-id attribute. Tracking disabled.');
        return;
    }

    // ── Detect Browser ────────────────────────────────────────────────────────
    function getBrowser() {
        const ua = navigator.userAgent;
        if (/Edg\//.test(ua))     return 'Edge';
        if (/OPR\//.test(ua))     return 'Opera';
        if (/Chrome\//.test(ua))  return 'Chrome';
        if (/Firefox\//.test(ua)) return 'Firefox';
        if (/Safari\//.test(ua))  return 'Safari';
        return 'Unknown';
    }

    // ── Detect OS ─────────────────────────────────────────────────────────────
    function getOS() {
        const ua = navigator.userAgent;
        if (/Windows/.test(ua))  return 'Windows';
        if (/Mac OS/.test(ua))   return 'macOS';
        if (/Android/.test(ua))  return 'Android';
        if (/iPhone|iPad/.test(ua)) return 'iOS';
        if (/Linux/.test(ua))    return 'Linux';
        return 'Unknown';
    }

    // ── Detect Device Type ────────────────────────────────────────────────────
    function getDevice() {
        if (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) return 'Mobile';
        return 'Desktop';
    }

    // ── Send Tracking Data ────────────────────────────────────────────────────
    function track() {
        const apiBase = (script.src || '').replace('/static/tracker.js', '');
        const payload = {
            site_id:  siteId,
            browser:  getBrowser(),
            os:       getOS(),
            device:   getDevice(),
            referrer: document.referrer || null,
            pathname: window.location.pathname,
        };

        // Use sendBeacon if available (non-blocking), fallback to fetch
        const endpoint = `${apiBase}/v1/track`;
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(endpoint, blob);
        } else {
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            }).catch(function () {});
        }
    }

    // Track on initial load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', track);
    } else {
        track();
    }

    // Track SPA navigation (works with React Router, Next.js, etc.)
    var _pushState = history.pushState;
    history.pushState = function () {
        _pushState.apply(history, arguments);
        track();
    };
    window.addEventListener('popstate', track);
})();
