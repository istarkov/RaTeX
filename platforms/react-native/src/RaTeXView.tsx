import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as ReactNative from 'react-native';
import {StyleSheet} from 'react-native';
import type {ColorValue, StyleProp, ViewStyle} from 'react-native';
import RaTeXViewNativeComponent from './RaTeXViewNativeComponent';
import {getTexMetrics as getNaturalTexMetrics} from './getTexMetrics';

// True inside <Text> (reset by nested <View>) — "am I an inline attachment".
// Native code can't tell: Android Fabric hoists inline views into the text's
// parent ViewGroup. Legacy module path covers RN without the unstable export.
const TextAncestorContext: React.Context<boolean> =
  (
    ReactNative as unknown as {
      unstable_TextAncestorContext?: React.Context<boolean>;
    }
  ).unstable_TextAncestorContext ??
  (
    require('react-native/Libraries/Text/TextAncestor') as {
      default: React.Context<boolean>;
    }
  ).default;

export const RaTeXColorContext = createContext<ColorValue | undefined>(undefined);

export interface RaTeXProviderProps {
  color?: ColorValue;
  children: React.ReactNode;
}

export function RaTeXProvider({
  color,
  children,
}: RaTeXProviderProps): React.JSX.Element {
  return (
    <RaTeXColorContext.Provider value={color}>
      {children}
    </RaTeXColorContext.Provider>
  );
}

/**
 * `depth` is DRAWN (fit-scale and centering gap applied — never multiply by
 * `scale`); `width`/`height` are NATURAL ink size; `scale` bridges the two.
 */
export interface RaTeXTexMetrics {
  /** View bottom edge → drawn ink baseline, dp. */
  depth: number;
  /** Fit scale k (≤ 1). */
  scale: number;
  /** Natural ink width, dp. */
  width: number;
  /** Natural ink height, dp. */
  height: number;
}

type NativeRaTeXViewInstance = React.ComponentRef<
  typeof RaTeXViewNativeComponent
>;

/** The genuine host instance (measure, …) plus `getTexMetrics()`. */
export type RaTeXViewRef = NativeRaTeXViewInstance & {
  /**
   * Sync TeX metrics at the committed layout (parse-cache-backed); null when
   * unmounted, empty, or parse failed. Call from `useLayoutEffect` or later.
   * Old arch: `measure` is async there, so metrics assume natural size.
   */
  getTexMetrics(): RaTeXTexMetrics | null;
};

export interface RaTeXViewProps {
  latex: string;
  /** Ref to the underlying native view (React 19 ref-as-prop). */
  ref?: React.Ref<RaTeXViewRef>;
  fontSize?: number;
  /** true (default) = display/block style ($$...$$); false = inline/text style ($...$). */
  displayMode?: boolean;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
  onError?: (e: {nativeEvent: {error: string}}) => void;
  /** Called when content size is measured (e.g. for scroll layout). */
  onContentSizeChange?: (e: {
    nativeEvent: {width: number; height: number};
  }) => void;
}

// Fabric self-sizes via the shadow node's measureContent; feeding the async
// (unconstrained) onContentSizeChange size back as a style would override
// parent clamps a commit later. The JS self-sizing pass is old-arch only.
const IS_FABRIC =
  (globalThis as {nativeFabricUIManager?: unknown}).nativeFabricUIManager !=
  null;

// One standard style for both host contexts: as a flex sibling alignSelf is
// plain Yoga (shadow baseline()); inside <Text> — where text layout ignores
// alignSelf — it is forwarded as the native `inlineAlign` shift. Gated by
// TextAncestorContext so the two contexts can't double-apply.
const INLINE_ALIGN_FROM_ALIGN_SELF: Partial<
  Record<string, 'baseline' | 'center' | 'start' | 'end'>
> = {
  baseline: 'baseline',
  center: 'center',
  'flex-start': 'start',
  'flex-end': 'end',
};

export function RaTeXView({
  latex,
  fontSize = 24,
  displayMode = true,
  color,
  style,
  onError,
  onContentSizeChange,
  ref,
}: RaTeXViewProps): React.JSX.Element {
  const inheritedColor = useContext(RaTeXColorContext);
  const [contentSize, setContentSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const resolvedColor = color ?? inheritedColor;

  const nativeRef = useRef<NativeRaTeXViewInstance | null>(null);

  const getTexMetrics = useCallback((): RaTeXTexMetrics | null => {
    const node = nativeRef.current;
    const natural = getNaturalTexMetrics(
      latex,
      fontSize,
      displayMode,
      resolvedColor,
    );
    if (!node || !natural || natural.width <= 0 || natural.height <= 0) {
      return null;
    }
    // Sync on Fabric; async on old arch → frame stays 0,0 → scale 1, no gap.
    let frameWidth = 0;
    let frameHeight = 0;
    node.measure((_x, _y, width, height) => {
      frameWidth = width;
      frameHeight = height;
    });
    // Mirrors the native drawing/baseline() math (fit-scale k + centering
    // gap); pixel snapping and optical raise are host calibration, left out.
    let scale = 1;
    let gap = 0;
    if (frameWidth > 0 && frameHeight > 0) {
      scale = Math.min(
        1,
        frameWidth / natural.width,
        frameHeight / natural.height,
      );
      gap = Math.max(0, (frameHeight - natural.height * scale) / 2);
    }
    return {
      depth: gap + Math.max(0, natural.depth) * scale,
      scale,
      width: natural.width,
      height: natural.height,
    };
  }, [latex, fontSize, displayMode, resolvedColor]);

  // Exposes the GENUINE host instance, augmented with getTexMetrics (child
  // refs attach before createHandle runs) — not a wrapper object, so host
  // identity, findNodeHandle, and every host method survive.
  useImperativeHandle(
    ref,
    () => {
      const node = nativeRef.current as RaTeXViewRef;
      node.getTexMetrics = getTexMetrics;
      return node;
    },
    [getTexMetrics],
  );

  // Old architecture only (contentSize is never set on Fabric): when inputs
  // change, drop the cached measurement so the view can shrink/grow instead of
  // keeping a stale width/height until the next event arrives.
  useEffect(() => {
    if (!IS_FABRIC) {
      setContentSize(null);
    }
  }, [latex, fontSize, displayMode, resolvedColor]);

  const handleContentSizeChange = useCallback(
    (e: {nativeEvent: {width: number; height: number}}) => {
      if (!IS_FABRIC) {
        setContentSize({
          width: e.nativeEvent.width,
          height: e.nativeEvent.height,
        });
      }
      onContentSizeChange?.(e);
    },
    [onContentSizeChange],
  );

  // Respect explicit width/height from user styles.
  // Auto-apply measured size only when width/height are not provided.
  const flatStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
  const hasWidth = typeof flatStyle?.width === 'number';
  const hasHeight = typeof flatStyle?.height === 'number';

  const hasTextAncestor = useContext(TextAncestorContext);
  const inlineAlign =
    (hasTextAncestor &&
      flatStyle?.alignSelf != null &&
      INLINE_ALIGN_FROM_ALIGN_SELF[flatStyle.alignSelf]) ||
    'none';

  const resolvedStyle = [
    style,
    contentSize
      ? {
          ...(hasWidth ? {} : {width: contentSize.width}),
          ...(hasHeight ? {} : {height: contentSize.height}),
        }
      : null,
  ];

  return (
    <RaTeXViewNativeComponent
      ref={nativeRef}
      latex={latex}
      fontSize={fontSize}
      displayMode={displayMode}
      inlineAlign={inlineAlign}
      color={resolvedColor}
      style={resolvedStyle}
      onError={onError}
      onContentSizeChange={handleContentSizeChange}
    />
  );
}
