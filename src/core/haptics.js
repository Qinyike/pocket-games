let enabled = true;

export function setHapticsEnabled(value) {
  enabled = Boolean(value);
}

export function isHapticsEnabled() {
  return enabled;
}

/**
 * 短促震动。iOS Safari 不支持 navigator.vibrate，会自动跳过。
 */
export function vibrate(pattern = 10) {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 忽略权限或设备限制。
  }
}
