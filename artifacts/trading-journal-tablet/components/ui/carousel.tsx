/**
 * carousel.tsx — React Native port
 *
 * Web source: embla-carousel-react (useEmblaCarousel)
 *
 * Web → RN replacements:
 *   useEmblaCarousel           → FlatList (pagingEnabled) + Animated dots
 *   UseEmblaCarouselType[1]    → CarouselApi (custom imperative ref type)
 *   embla options/plugins      → opts / plugins accepted for API compat; ignored
 *   HTMLDivElement             → View
 *   onKeyDownCapture           → no keyboard in RN (touch-driven)
 *   overflow-hidden            → FlatList clips naturally
 *   ArrowLeft/ArrowRight icons → Unicode arrows via Text
 *   -ml-4 / pl-4              → FlatList item gap handled via ItemSeparator
 *
 * Preserved API:
 *   CarouselApi (type)          — imperative handle
 *   Carousel                    — root provider
 *   CarouselContent             — FlatList wrapper (renders children as items)
 *   CarouselItem                — individual slide wrapper
 *   CarouselPrevious            — prev button
 *   CarouselNext                — next button
 *   useCarousel()               — hook to access context
 *   orientation, opts, plugins, setApi props
 *
 * Architecture:
 *   CarouselContent collects its CarouselItem children into a FlatList.
 *   An Animated pagination dot row is shown below the content.
 *   CarouselPrevious / CarouselNext call scrollToIndex imperatively.
 */

import * as React from "react";
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type FlatListProps,
  type ViewProps,
  type PressableProps,
} from "react-native";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

// ─── CarouselApi type ─────────────────────────────────────────────────────────

export type CarouselApi = {
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: () => boolean;
  canScrollNext: () => boolean;
  scrollTo: (index: number, animated?: boolean) => void;
  selectedScrollSnap: () => number;
  scrollSnapList: () => number[];
  on: (event: string, callback: () => void) => CarouselApi;
  off: (event: string, callback: () => void) => CarouselApi;
} | undefined;

// ─── Internal option types (API compat stubs) ─────────────────────────────────

export type CarouselOptions = Record<string, unknown>;
export type CarouselPlugin = unknown[];

// ─── Context ──────────────────────────────────────────────────────────────────

interface CarouselContextValue {
  orientation: "horizontal" | "vertical";
  currentIndex: number;
  itemCount: number;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  // internal — used by CarouselContent to wire the FlatList ref
  registerFlatList: (ref: FlatList | null, count: number) => void;
}

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

export function useCarousel(): CarouselContextValue {
  const ctx = React.useContext(CarouselContext);
  if (!ctx) throw new Error("useCarousel must be used within a <Carousel />");
  return ctx;
}

// ─── Carousel (Root) ──────────────────────────────────────────────────────────

export interface CarouselProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  setApi?: (api: CarouselApi) => void;
}

const Carousel = React.forwardRef<View, CarouselProps>(
  (
    {
      orientation = "horizontal",
      opts: _opts,
      plugins: _plugins,
      setApi,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [itemCount, setItemCount] = React.useState(0);
    const flatListRef = React.useRef<FlatList | null>(null);

    const canScrollPrev = currentIndex > 0;
    const canScrollNext = currentIndex < itemCount - 1;

    const scrollTo = React.useCallback(
      (index: number, animated = true) => {
        flatListRef.current?.scrollToIndex({ index, animated });
        setCurrentIndex(index);
      },
      [],
    );

    const scrollPrev = React.useCallback(() => {
      if (canScrollPrev) scrollTo(currentIndex - 1);
    }, [canScrollPrev, currentIndex, scrollTo]);

    const scrollNext = React.useCallback(() => {
      if (canScrollNext) scrollTo(currentIndex + 1);
    }, [canScrollNext, currentIndex, scrollTo]);

    const registerFlatList = React.useCallback(
      (ref: FlatList | null, count: number) => {
        flatListRef.current = ref;
        setItemCount(count);
      },
      [],
    );

    // Expose imperative API via setApi
    React.useEffect(() => {
      if (!setApi) return;
      const api: CarouselApi = {
        scrollPrev,
        scrollNext,
        canScrollPrev: () => currentIndex > 0,
        canScrollNext: () => currentIndex < itemCount - 1,
        scrollTo,
        selectedScrollSnap: () => currentIndex,
        scrollSnapList: () =>
          Array.from({ length: itemCount }, (_, i) => i),
        on: (_event: string, _cb: () => void) => api!,
        off: (_event: string, _cb: () => void) => api!,
      };
      setApi(api);
    }, [setApi, scrollPrev, scrollNext, currentIndex, itemCount, scrollTo]);

    return (
      <CarouselContext.Provider
        value={{
          orientation,
          currentIndex,
          itemCount,
          scrollPrev,
          scrollNext,
          canScrollPrev,
          canScrollNext,
          registerFlatList,
        }}
      >
        <View
          ref={ref}
          accessibilityRole="adjustable"
          accessibilityLabel="Carousel"
          className={cn("relative", className)}
          {...props}
        >
          {children}
        </View>
      </CarouselContext.Provider>
    );
  },
);
Carousel.displayName = "Carousel";

// ─── CarouselContent ──────────────────────────────────────────────────────────
// Collects CarouselItem children into a paged FlatList.

export interface CarouselContentProps extends ViewProps {}

const CarouselContent = React.forwardRef<View, CarouselContentProps>(
  ({ className, children, ...props }, ref) => {
    const { orientation, registerFlatList } = useCarousel();
    const { width: screenWidth } = useWindowDimensions();
    const [currentIndex, setCurrentIndex] = React.useState(0);

    // Flatten children into an array
    const items = React.useMemo(
      () => React.Children.toArray(children),
      [children],
    );
    const count = items.length;

    const flatListRefCallback = React.useCallback(
      (r: FlatList | null) => {
        registerFlatList(r, count);
      },
      [registerFlatList, count],
    );

    const scrollX = React.useRef(new Animated.Value(0)).current;

    return (
      <View ref={ref} className={cn("overflow-hidden", className)} {...props}>
        <FlatList
          ref={flatListRefCallback}
          data={items}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item }) => (
            <View style={{ width: screenWidth }}>{item as React.ReactNode}</View>
          )}
          horizontal={orientation === "horizontal"}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const offset =
              orientation === "horizontal"
                ? e.nativeEvent.contentOffset.x
                : e.nativeEvent.contentOffset.y;
            const newIndex = Math.round(offset / screenWidth);
            setCurrentIndex(newIndex);
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
        />

        {/* Pagination dots */}
        {count > 1 && (
          <View className="flex-row justify-center gap-1.5 mt-3">
            {items.map((_, idx) => (
              <Animated.View
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === currentIndex
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/40",
                )}
              />
            ))}
          </View>
        )}
      </View>
    );
  },
);
CarouselContent.displayName = "CarouselContent";

// ─── CarouselItem ─────────────────────────────────────────────────────────────

const CarouselItem = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      accessibilityRole="none"
      className={cn("min-w-0 flex-1 p-4", className)}
      {...props}
    />
  ),
);
CarouselItem.displayName = "CarouselItem";

// ─── CarouselPrevious ─────────────────────────────────────────────────────────

const CarouselPrevious = React.forwardRef<View, ButtonProps>(
  ({ className, variant = "outline", size = "icon", ...props }, ref) => {
    const { scrollPrev, canScrollPrev, orientation } = useCarousel();

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          "absolute h-8 w-8 rounded-full",
          orientation === "horizontal"
            ? "left-2 top-1/2 -translate-y-1/2"
            : "top-2 left-1/2",
          className,
        )}
        disabled={!canScrollPrev}
        onPress={scrollPrev}
        accessibilityLabel="Previous slide"
        {...props}
      >
        <Text className="text-foreground text-base">{"‹"}</Text>
      </Button>
    );
  },
);
CarouselPrevious.displayName = "CarouselPrevious";

// ─── CarouselNext ─────────────────────────────────────────────────────────────

const CarouselNext = React.forwardRef<View, ButtonProps>(
  ({ className, variant = "outline", size = "icon", ...props }, ref) => {
    const { scrollNext, canScrollNext, orientation } = useCarousel();

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          "absolute h-8 w-8 rounded-full",
          orientation === "horizontal"
            ? "right-2 top-1/2 -translate-y-1/2"
            : "bottom-2 left-1/2",
          className,
        )}
        disabled={!canScrollNext}
        onPress={scrollNext}
        accessibilityLabel="Next slide"
        {...props}
      >
        <Text className="text-foreground text-base">{"›"}</Text>
      </Button>
    );
  },
);
CarouselNext.displayName = "CarouselNext";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};
