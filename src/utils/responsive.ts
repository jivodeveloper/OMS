import { Dimensions, PixelRatio } from "react-native";

/**
 * Screen-size scaling helpers.
 *
 * The dashboard was laid out against a ~390pt-wide phone. On narrower devices
 * (iPhone SE, compact Androids) fixed font/spacing values overflow and rows
 * collide; on wide devices they look sparse. These helpers scale sizes with the
 * screen so the SAME layout stays readable everywhere instead of reflowing into
 * a different design.
 *
 * The app is portrait-locked (app.json `orientation: "portrait"`), so reading
 * Dimensions once at module load is safe and keeps these cheap enough to call
 * from StyleSheet.create.
 */

const { width, height } = Dimensions.get("window");

const BASE_WIDTH = 390;

export const SCREEN_WIDTH = width;
export const SCREEN_HEIGHT = height;

/** Compact phones — use to drop non-essential chrome, not to change layout. */
export const isSmallDevice = width < 360;
export const isTallDevice = height >= 850;

// Clamp the ratio so tablets don't balloon and tiny phones don't collapse.
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const widthRatio = clamp(width / BASE_WIDTH, 0.82, 1.15);

/** Linear scale with screen width. */
export const scale = (size: number) => size * widthRatio;

/**
 * Damped scale: shrinks/grows with the screen but far less aggressively than
 * linear, which is what you want for type and spacing.
 */
export const moderateScale = (size: number, factor = 0.5) =>
  size + (scale(size) - size) * factor;

/** Font size — damped and snapped to the device pixel grid. */
export const fs = (size: number) =>
  Math.round(PixelRatio.roundToNearestPixel(moderateScale(size, 0.4)));

/** Spacing (padding / margin / gap / radius). */
export const sp = (size: number) =>
  Math.round(PixelRatio.roundToNearestPixel(moderateScale(size, 0.5)));

/** Icon / avatar dimensions. */
export const ms = (size: number) =>
  Math.round(PixelRatio.roundToNearestPixel(moderateScale(size, 0.45)));

/**
 * Drawer width — ~70% of the screen, wide enough that menu labels ("Sales
 * Quotation", "Page Permissions") read in full instead of truncating, while
 * still leaving a strip of the page visible to tap for closing it. Clamped so
 * it stays usable on small phones and doesn't sprawl on tablets.
 */
export const DRAWER_WIDTH = Math.round(clamp(width * 0.7, 240, 380));
