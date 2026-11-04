import { useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Small overshoot the loop tolerates before shrinking the window again.
 *
 * Sub-pixel noise from Retina rounding can leave the window a pixel or two
 * taller than requested; resizing for that would ping-pong forever.
 */
const HEIGHT_TOLERANCE = 2;

/**
 * Upper bound for the learned viewport shortfall, in CSS pixels.
 *
 * The loop below learns the gap between the requested window height and the
 * webview viewport height the OS actually reports. On real machines this is a
 * small constant; the cap only guards against runaway requests while the
 * window is still settling.
 */
const MAX_RESERVE = 64;

/**
 * CSS-pixel height the window should adopt for a measured content box.
 *
 * Returns 0 when there is nothing to show yet, so the caller skips the
 * resize. Otherwise the content height is rounded up. No extra margin is
 * added here: the backend verifies the adopted window height and compensates
 * any shortfall itself, so the visible bottom gap stays exactly the
 * container's own padding, like the sides.
 */
export function windowHeightFor(contentHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  return Math.ceil(contentHeight);
}

/**
 * Height of the app content in CSS pixels.
 *
 * `documentElement.scrollHeight` is at least the viewport height, so the
 * old `Math.max(body, documentElement)` measurement could never shrink the
 * window. `#root` is `height: auto`, and its border box is the content
 * in both directions.
 */
export function measureContentHeight(root: HTMLElement | null): number {
  if (!root) return 0;
  return windowHeightFor(root.getBoundingClientRect().height);
}

/**
 * Keep the window height equal to the content, in both directions.
 *
 * A collapse animation is followed about every 50ms, with one extra
 * measure after it goes quiet so the window is not left a frame short.
 */
export default function useFitWindow() {
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let trailing: ReturnType<typeof setTimeout> | undefined;

    // Shortfall learned so far between the requested window height and the
    // viewport height the webview reports (request minus viewport). It is a
    // stable per-machine offset; adding it back to the request lands the
    // viewport exactly on the content.
    const reserveRef = { current: 0 };
    // Last observation, to recalibrate only once content and viewport are
    // both settled (identical on two consecutive checks).
    const lastRef = {
      current: null as { content: number; inner: number; requested: number } | null,
    };

    const fit = () => {
      const content = measureContentHeight(root);
      if (content === 0) return;
      const inner = window.innerHeight;
      const last = lastRef.current;
      if (last && last.content === content && last.inner === inner) {
        const learned = last.requested - inner;
        reserveRef.current = Math.max(0, Math.min(MAX_RESERVE, learned));
      }
      const height = content + reserveRef.current;
      lastRef.current = { content, inner, requested: height };
      // Skip when the viewport already covers the content and overshoots by
      // next to nothing. Anything shorter must keep growing: settling short
      // would clip the card's bottom edge.
      if (inner >= content && inner - height <= HEIGHT_TOLERANCE) return;
      invoke("fit_window_height", { height }).catch(() => {
        // The next content change, or the safety pass below, retries.
      });
    };

    const onResize = () => {
      if (trailing !== undefined) return;
      fit();
      trailing = setTimeout(() => {
        trailing = undefined;
        fit();
      }, 50);
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    fit();

    const watchdog = setInterval(() => {
      if (trailing !== undefined) return;
      fit();
    }, 1000);

    return () => {
      observer.disconnect();
      clearInterval(watchdog);
      clearTimeout(trailing);
    };
  }, []);
}
