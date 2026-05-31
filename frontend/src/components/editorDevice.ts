export function isMobileOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isAndroid = /Android/.test(ua);

  const isCoarsePointer =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches;

  const isSmallOrMediumScreen =
    typeof window !== 'undefined' && window.innerWidth <= 1024;

  return isIOS || isAndroid || (isCoarsePointer && isSmallOrMediumScreen);
}
