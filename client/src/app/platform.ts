export const isAppShellRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;

  const w = window as any;

  // Native wrappers can set an explicit flag.
  if (w.__BITRUVIUS_APP__ === true) return true;

  // Build-time flag (optional): VITE_APP_SHELL=1
  try {
    const v = (import.meta as any)?.env?.VITE_APP_SHELL;
    if (v === '1' || v === 'true') return true;
  } catch {
    // ignore
  }

  // Common native shells.
  if (w.__TAURI__) return true;
  if (w.Capacitor) return true;
  if (w.ReactNativeWebView) return true;
  if (w.electron?.ipcRenderer) return true;

  // Fallback: allow an opt-in query param for local testing.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') return true;
  } catch {
    // ignore
  }

  return false;
};

