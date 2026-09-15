import { useWindowDimensions } from "react-native";

/**
 * One place that decides what size screen we are on.
 *
 * The app targets phones and tablets, and the difference matters most in
 * phase 6, where an estimate is turned around and handed to a customer to
 * sign. Scattering `width > 768` checks through screens makes that layout
 * impossible to reason about later, so every screen asks this instead.
 *
 * 768pt is the iPad portrait width and the conventional break between "one
 * column" and "two". `isWide` is deliberately about available width rather
 * than device class: a tablet in split view is a phone-shaped surface.
 */
export type Layout = {
  width: number;
  height: number;
  /** Enough room for a side-by-side layout. */
  isWide: boolean;
  isLandscape: boolean;
  /** Content is capped on a tablet — full-bleed text is unreadable at that width. */
  contentMaxWidth: number;
};

export const WIDE_BREAKPOINT = 768;

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  return {
    width,
    height,
    isWide,
    isLandscape: width > height,
    contentMaxWidth: isWide ? 720 : width,
  };
}
