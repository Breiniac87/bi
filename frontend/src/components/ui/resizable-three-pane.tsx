'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResizableThreePaneProps {
  id: string;
  storageKey?: string;
  defaultSplit1?: number; // Left pane % (default 24)
  defaultSplit2?: number; // Middle pane % (default 38)
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}

export function ResizableThreePane({
  id,
  storageKey,
  defaultSplit1 = 24,
  defaultSplit2 = 38,
  left,
  middle,
  right,
  className
}: ResizableThreePaneProps) {
  const resolvedKey = storageKey || `split_three_${id}`;
  const [split1, setSplit1] = useState<number>(defaultSplit1);
  const [split2, setSplit2] = useState<number>(defaultSplit2);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [activeGutter, setActiveGutter] = useState<1 | 2 | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem(resolvedKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.split1 === 'number' && typeof data.split2 === 'number') {
          if (data.split1 >= 15 && data.split2 >= 20 && (data.split1 + data.split2) <= 85) {
            setSplit1(data.split1);
            setSplit2(data.split2);
          }
        }
      }
    } catch {}
  }, [resolvedKey]);

  const saveSplits = useCallback((s1: number, s2: number) => {
    try {
      localStorage.setItem(resolvedKey, JSON.stringify({ split1: Number(s1.toFixed(1)), split2: Number(s2.toFixed(1)) }));
    } catch {}
  }, [resolvedKey]);

  const handleReset = () => {
    setSplit1(defaultSplit1);
    setSplit2(defaultSplit2);
    saveSplits(defaultSplit1, defaultSplit2);
  };

  const handleStartDrag = (gutterIndex: 1 | 2) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setActiveGutter(gutterIndex);

    const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const pct = ((clientX - rect.left) / rect.width) * 100;

      if (gutterIndex === 1) {
        // Dragging boundary between Left and Middle
        const newSplit1 = Math.max(15, Math.min(45, pct));
        // Ensure middle has at least 20%
        const maxSplit1 = 100 - split2 - 20;
        const clamped1 = Math.min(newSplit1, maxSplit1);
        setSplit1(clamped1);
      } else {
        // Dragging boundary between Middle and Right
        // pct is split1 + middle
        const totalLeftAndMiddle = Math.max(split1 + 20, Math.min(85, pct));
        const newSplit2 = totalLeftAndMiddle - split1;
        setSplit2(newSplit2);
      }
    };

    const onPointerEnd = () => {
      setActiveGutter(null);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerEnd);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerEnd);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerEnd);
  };

  useEffect(() => {
    if (activeGutter === null && isMounted) {
      saveSplits(split1, split2);
    }
  }, [activeGutter, split1, split2, isMounted, saveSplits]);

  const split3 = Math.max(15, 100 - split1 - split2);

  return (
    <div
      ref={containerRef}
      className={cn("w-full flex flex-col lg:flex-row min-w-0 select-none", className)}
      style={{ userSelect: activeGutter !== null ? 'none' : undefined }}
    >
      {/* 1. Left Pane */}
      <div
        className="w-full lg:min-w-0 flex flex-col"
        style={{ width: isMounted ? `${split1}%` : `${defaultSplit1}%` }}
      >
        {left}
      </div>

      {/* Gutter 1 */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Потяните для настройки ширины (двойной клик — сброс)"
        onMouseDown={handleStartDrag(1)}
        onTouchStart={handleStartDrag(1)}
        onDoubleClick={handleReset}
        className={cn(
          "hidden lg:flex items-center justify-center relative cursor-col-resize select-none shrink-0 group z-10",
          "w-3 -mx-1.5 transition-colors touch-none"
        )}
      >
        <div className={cn("w-[1px] h-full transition-colors", activeGutter === 1 ? "bg-primary w-[2px]" : "bg-border/60 group-hover:bg-primary/80")} />
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-3.5 h-7 rounded-full border shadow-xs transition-all pointer-events-none",
          activeGutter === 1 ? "bg-primary text-primary-foreground border-primary scale-110 shadow-md ring-2 ring-primary/20" : "bg-background text-muted-foreground/80 border-border group-hover:border-primary/50 group-hover:text-primary group-hover:scale-105 group-hover:bg-accent"
        )}>
          <GripVertical className="w-2.5 h-2.5" />
        </div>
      </div>

      <div className="w-full h-px bg-border/40 my-3 lg:hidden" />

      {/* 2. Middle Pane */}
      <div
        className="w-full lg:min-w-0 flex flex-col"
        style={{ width: isMounted ? `calc(${split2}% - 12px)` : `calc(${defaultSplit2}% - 12px)` }}
      >
        {middle}
      </div>

      {/* Gutter 2 */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Потяните для настройки ширины (двойной клик — сброс)"
        onMouseDown={handleStartDrag(2)}
        onTouchStart={handleStartDrag(2)}
        onDoubleClick={handleReset}
        className={cn(
          "hidden lg:flex items-center justify-center relative cursor-col-resize select-none shrink-0 group z-10",
          "w-3 -mx-1.5 transition-colors touch-none"
        )}
      >
        <div className={cn("w-[1px] h-full transition-colors", activeGutter === 2 ? "bg-primary w-[2px]" : "bg-border/60 group-hover:bg-primary/80")} />
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-3.5 h-7 rounded-full border shadow-xs transition-all pointer-events-none",
          activeGutter === 2 ? "bg-primary text-primary-foreground border-primary scale-110 shadow-md ring-2 ring-primary/20" : "bg-background text-muted-foreground/80 border-border group-hover:border-primary/50 group-hover:text-primary group-hover:scale-105 group-hover:bg-accent"
        )}>
          <GripVertical className="w-2.5 h-2.5" />
        </div>
      </div>

      <div className="w-full h-px bg-border/40 my-3 lg:hidden" />

      {/* 3. Right Pane */}
      <div
        className="w-full lg:min-w-0 flex flex-col"
        style={{ width: isMounted ? `calc(${split3}% - 12px)` : `calc(${100 - defaultSplit1 - defaultSplit2}% - 12px)` }}
      >
        {right}
      </div>
    </div>
  );
}
