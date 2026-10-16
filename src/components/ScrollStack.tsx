import React, { useLayoutEffect, useRef, useCallback } from 'react';
import Lenis from 'lenis';
import './ScrollStack.css';

export interface ScrollStackItemProps {
  children: React.ReactNode;
  itemClassName?: string;
}

export const ScrollStackItem: React.FC<ScrollStackItemProps> = ({
  children,
  itemClassName = '',
}) => (
  <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>
);

export interface ScrollStackProps {
  children: React.ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  scaleDuration?: number;
  rotationAmount?: number;
  blurAmount?: number;
  useWindowScroll?: boolean;
  onStackComplete?: () => void;
}

// Below this width the cards are simply shown one after another (no pinning).
const COMPACT_BREAKPOINT = 768;

const ScrollStack: React.FC<ScrollStackProps> = ({
  children,
  className = '',
  itemDistance = 80,
  itemScale = 0.03,
  itemStackDistance = 32,
  stackPosition = '15%',
  scaleEndPosition = '8%',
  baseScale = 0.88,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = true,
  onStackComplete,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const initialTopsRef = useRef<number[]>([]);
  const lastTransformsRef = useRef(new Map());
  const isUpdatingRef = useRef(false);
  const compactRef = useRef(false);

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value: string | number, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return typeof value === 'number' ? value : parseFloat(value);
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
      };
    } else {
      const scroller = scrollerRef.current;
      return {
        scrollTop: scroller ? scroller.scrollTop : 0,
        containerHeight: scroller ? scroller.clientHeight : 0,
      };
    }
  }, [useWindowScroll]);

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current || compactRef.current) return;

    isUpdatingRef.current = true;

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);

    const endElement = scrollerRef.current?.querySelector('.scroll-stack-end') as HTMLElement | null;

    const endElementTop = endElement
      ? endElement.getBoundingClientRect().top + window.scrollY
      : 0;

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = initialTopsRef.current[i] || 0;
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      const pinEnd = endElementTop - containerHeight / 2;

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardsRef.current.length; j++) {
          const jCardTop = initialTopsRef.current[j] || 0;
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) {
            topCardIndex = j;
          }
        }

        if (i < topCardIndex) {
          const depthInStack = topCardIndex - i;
          blur = Math.max(0, depthInStack * blurAmount);
        }
      }

      let translateY = 0;
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;

      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const newTransform = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.1 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.001 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1;

      if (hasChanged) {
        const transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`;
        const filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : '';

        card.style.transform = transform;
        card.style.filter = filter;

        lastTransformsRef.current.set(i, newTransform);
      }

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });

    isUpdatingRef.current = false;
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
  ]);

  /**
   * (Re)measures the cards and decides between "stack" and "compact" mode.
   *
   * The original version measured the cards only once, on mount. On phones the text above
   * the cards (hero/about) re-wraps when the web fonts and images finish loading, which moves
   * the cards down. The stale positions then made the cards pin in the wrong place and slide
   * over the next section. This runs again on resize, font load, page load and whenever the
   * page height changes.
   */
  const applyLayout = useCallback(() => {
    const scroller = scrollerRef.current;
    const cards = cardsRef.current;
    if (!scroller || !cards.length) return;

    const viewportH = window.innerHeight;
    const stackPx = parsePercentage(stackPosition, viewportH);
    const tallest = Math.max(...cards.map((c) => c.offsetHeight));

    // Phones, or any screen where a card is too tall to fit when pinned, scroll normally.
    const compact =
      window.innerWidth < COMPACT_BREAKPOINT || tallest + stackPx > viewportH - 24;

    compactRef.current = compact;
    scroller.classList.toggle('is-compact', compact);
    lastTransformsRef.current.clear();

    cards.forEach((card, i) => {
      card.style.zIndex = `${i + 1}`;
      card.style.marginBottom = i < cards.length - 1 ? `${itemDistance}px` : '';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
      card.style.perspective = '1000px';
      card.style.filter = '';
      if (compact) {
        card.style.willChange = 'auto';
        card.style.transform = 'none';
      } else {
        card.style.willChange = 'transform, filter';
        card.style.transform = 'translateZ(0)';
      }
    });

    if (!compact) {
      // Natural (transform-free) top positions, measured after the layout has settled.
      cards.forEach((card) => {
        card.style.transform = 'none';
      });
      initialTopsRef.current = cards.map(
        (card) => card.getBoundingClientRect().top + window.scrollY
      );
      cards.forEach((card) => {
        card.style.transform = 'translateZ(0)';
      });
    }

    updateCardTransforms();
  }, [itemDistance, stackPosition, parsePercentage, updateCardTransforms]);

  const handleScroll = useCallback(() => {
    updateCardTransforms();
  }, [updateCardTransforms]);

  const setupLenis = useCallback(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
    });

    lenis.on('scroll', handleScroll);

    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameRef.current = requestAnimationFrame(raf);
    };
    animationFrameRef.current = requestAnimationFrame(raf);

    lenisRef.current = lenis;
    return lenis;
  }, [handleScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    cardsRef.current = Array.from(
      scroller.querySelectorAll('.scroll-stack-card')
    ) as HTMLElement[];

    setupLenis();
    applyLayout();

    // Re-measure whenever something that can move the cards changes.
    let pending: number | null = null;
    const scheduleLayout = () => {
      if (pending !== null) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        applyLayout();
      });
    };

    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('orientationchange', scheduleLayout);
    window.addEventListener('load', scheduleLayout);
    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleLayout).catch(() => {});
    }
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleLayout) : null;
    resizeObserver?.observe(document.body);

    return () => {
      window.removeEventListener('resize', scheduleLayout);
      window.removeEventListener('orientationchange', scheduleLayout);
      window.removeEventListener('load', scheduleLayout);
      resizeObserver?.disconnect();
      if (pending !== null) cancelAnimationFrame(pending);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
      }
      stackCompletedRef.current = false;
      cardsRef.current = [];
      initialTopsRef.current = [];
      lastTransformsRef.current.clear();
      isUpdatingRef.current = false;
    };
  }, [setupLenis, applyLayout]);

  return (
    <div className={`scroll-stack-scroller ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" />
      </div>
    </div>
  );
};

export default ScrollStack;
