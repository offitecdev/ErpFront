package com.offitec.erp;

import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.Collections;

public class MainActivity extends BridgeActivity {
    /**
     * Elo touch panels may expose a hover-capable pointer to Android WebView.
     * The web UI would then wait for mouseleave and leave the sidebar flyout
     * stuck over the page. This bootstrap runs before the remote PWA scripts
     * and makes the WebView report the input mode it is actually used with.
     */
    private static final String ELO_TOUCH_BOOTSTRAP =
        "(() => {" +
        // The Elo installation uses the screen-facing camera for personnel
        // badges. The deployed PWA still asks for `environment`, so normalize
        // every WebRTC video request before Chromium selects a capture device.
        "const formatCameraFailure = (error, constraints) => {" +
        "const lines = ['Camera getUserMedia failed', 'time: ' + new Date().toISOString(), 'url: ' + location.href];" +
        "if (error) {" +
        "if (error.name) lines.push('name: ' + error.name);" +
        "if (error.message) lines.push('message: ' + error.message);" +
        "if (error.constraint) lines.push('constraint: ' + error.constraint);" +
        "if (error.code != null) lines.push('code: ' + error.code);" +
        "if (error.cause != null) lines.push('cause: ' + String(error.cause));" +
        "if (error.stack) lines.push('stack:\\n' + error.stack);" +
        "try { const raw = {}; Object.getOwnPropertyNames(error).forEach((key) => raw[key] = String(error[key])); lines.push('raw:\\n' + JSON.stringify(raw, null, 2)); } catch (_) {}" +
        "}" +
        "try { lines.push('constraints:\\n' + JSON.stringify(constraints, null, 2)); } catch (_) {}" +
        "return lines.join('\\n');" +
        "};" +
        "const showCameraFailure = (error, constraints, firstError, firstConstraints) => {" +
        "if (!document.body) return;" +
        "let panel = document.getElementById('offitec-camera-error-details');" +
        "if (!panel) {" +
        "panel = document.createElement('pre');" +
        "panel.id = 'offitec-camera-error-details';" +
        "panel.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-height:42vh;overflow:auto;margin:0;padding:14px;border:2px solid #dc2626;border-radius:10px;background:#fff1f2;color:#7f1d1d;font:12px/1.45 monospace;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 12px 40px rgba(0,0,0,.28);';" +
        "document.body.appendChild(panel);" +
        "}" +
        "panel.textContent = (firstError ? 'FRONT CAMERA ATTEMPT:\\n' + formatCameraFailure(firstError, firstConstraints) + '\\n\\nANY CAMERA FALLBACK:\\n' : '') + formatCameraFailure(error, constraints);" +
        "};" +
        "const clearCameraFailure = () => document.getElementById('offitec-camera-error-details')?.remove();" +
        "const forceFrontCamera = () => {" +
        "const media = navigator.mediaDevices;" +
        "if (!media || typeof media.getUserMedia !== 'function' || media.getUserMedia.__offitecFrontCamera) return;" +
        "const nativeGetUserMedia = media.getUserMedia.bind(media);" +
        "const frontGetUserMedia = (constraints = {}) => {" +
        "if (!constraints || typeof constraints !== 'object' || !constraints.video) return nativeGetUserMedia(constraints);" +
        "const next = { ...constraints };" +
        "const video = constraints.video === true || typeof constraints.video !== 'object' ? {} : { ...constraints.video };" +
        "delete video.deviceId;" +
        "video.facingMode = { exact: 'user' };" +
        "next.video = video;" +
        "return nativeGetUserMedia(next).then((stream) => { clearCameraFailure(); return stream; }, (error) => {" +
        "const canFallback = error && ['NotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name);" +
        "if (!canFallback) { showCameraFailure(error, next); throw error; }" +
        "const fallback = { ...next, video: true };" +
        "return nativeGetUserMedia(fallback).then((stream) => { clearCameraFailure(); return stream; }, (fallbackError) => { showCameraFailure(fallbackError, fallback, error, next); throw fallbackError; });" +
        "});" +
        "};" +
        "Object.defineProperty(frontGetUserMedia, '__offitecFrontCamera', { value: true });" +
        "media.getUserMedia = frontGetUserMedia;" +
        "};" +
        "forceFrontCamera();" +
        "document.addEventListener('DOMContentLoaded', forceFrontCamera, { once: true });" +
        "window.addEventListener('load', forceFrontCamera, { once: true });" +
        "const nativeMatchMedia = window.matchMedia.bind(window);" +
        "window.matchMedia = (query) => {" +
        "const result = nativeMatchMedia(query);" +
        "if (query !== '(hover: none)' && query !== '(any-pointer: coarse)') return result;" +
        "return new Proxy(result, { get(target, property) {" +
        "if (property === 'matches') return true;" +
        "const value = Reflect.get(target, property, target);" +
        "return typeof value === 'function' ? value.bind(target) : value;" +
        "} });" +
        "};" +
        // Large Elo touch displays cross Tailwind's desktop (`lg`) breakpoint.
        // Reuse the PWA's already-rendered mobile drawer without changing the
        // viewport scale (fixed viewport widths misalign touch coordinates).
        "if (Math.max(screen.width, screen.height) >= 1024) {" +
        "const applyTouchDrawer = () => {" +
        "const drawer = [...document.querySelectorAll('div')].find((node) =>" +
        "node.classList.contains('fixed') && node.classList.contains('inset-0') &&" +
        "node.classList.contains('z-[80]') && node.classList.contains('lg:hidden'));" +
        "if (!drawer || !drawer.parentElement) return;" +
        "const shell = drawer.parentElement;" +
        "drawer.style.setProperty('display', 'block', 'important');" +
        // The currently deployed PWA can serve a stale CSS bundle whose
        // -translate-x-full utility is missing. React then marks the drawer as
        // closed and pointer-events:none while the sheet remains visible. Drive
        // the visual and hit-test state directly from React's aria-hidden flag.
        "const drawerOpen = drawer.getAttribute('aria-hidden') !== 'true';" +
        "const backdrop = drawer.children[0];" +
        "const sheet = drawer.children[1];" +
        "drawer.style.setProperty('pointer-events', drawerOpen ? 'auto' : 'none', 'important');" +
        "if (backdrop) {" +
        "backdrop.style.setProperty('opacity', drawerOpen ? '1' : '0', 'important');" +
        "backdrop.style.setProperty('pointer-events', drawerOpen ? 'auto' : 'none', 'important');" +
        "}" +
        "if (sheet) {" +
        "sheet.style.setProperty('transform', drawerOpen ? 'translate3d(0,0,0)' : 'translate3d(-100%,0,0)', 'important');" +
        "sheet.style.setProperty('pointer-events', drawerOpen ? 'auto' : 'none', 'important');" +
        "}" +
        "const desktopRail = [...shell.children].find((node) => node.tagName === 'ASIDE');" +
        "if (desktopRail) desktopRail.style.setProperty('display', 'none', 'important');" +
        "const spacer = [...shell.children].find((node) => node.style && node.style.paddingLeft === '84px');" +
        "if (spacer) spacer.style.setProperty('display', 'none', 'important');" +
        "shell.style.setProperty('--app-shell-inset', '0px');" +
        "const header = shell.querySelector('header.ofi-topbar');" +
        "if (!header) return;" +
        "header.style.setProperty('left', '0px', 'important');" +
        "const opener = header.querySelector('button[aria-pressed]');" +
        "if (opener) opener.style.setProperty('display', 'flex', 'important');" +
        "const brandImage = header.querySelector('img[alt=Offitec]');" +
        "const brandLink = brandImage && brandImage.closest('a');" +
        "if (brandLink) brandLink.style.setProperty('display', 'flex', 'important');" +
        "};" +
        "const observer = new MutationObserver(applyTouchDrawer);" +
        "observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });" +
        "document.addEventListener('DOMContentLoaded', applyTouchDrawer, { once: true });" +
        "window.addEventListener('load', applyTouchDrawer, { once: true });" +
        "}" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        // Keep Capacitor's Chrome client (file chooser, dialogs, fullscreen,
        // etc.) and override only the web-origin hardware permission decision.
        webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        WebViewCompat.addDocumentStartJavaScript(
            webView,
            ELO_TOUCH_BOOTSTRAP,
            Collections.singleton("https://demo.offitec.ch")
        );

        // BridgeActivity has already initiated the first navigation. Restart it
        // once so the document-start script is guaranteed to precede React.
        webView.stopLoading();
        webView.reload();
    }
}
