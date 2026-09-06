'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResizableSplitPaneProps {
  id: string;
  storageKey?: string;
  defaultSplit?: number; // percent for left pane (e.g. 33)
  minPercent?: number; // default 18
  maxPercent?: number; // default 65
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}

export function ResizableSplitPane({
  id,
  storageKey,
  defaultSplit = 32,
  minPercent = 18,
  maxPercent = 65,
  left,
  right,
  className
}: ResizableSplitPaneProps) {
  const resolvedKey = storageKey || `split_pane_${id}`;
  const [splitPercent, setSplitPercent] = useState<number>(defaultSplit);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load initial ratio from localStorage safely
  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem(resolvedKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= minPercent && parsed <= maxPercent) {
          setSplitPercent(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [resolvedKey, minPercent, maxPercent]);

  // Persist ratio on change
  const saveSplit = useCallback((val: number) => {
    try {
      localStorage.setItem(resolvedKey, val.toFixed(1));
    } catch {}
  }, [resolvedKey]);

  // Reset to default on double click
  const handleDoubleClick = () => {
    setSplitPercent(defaultSplit);
    saveSplit(defaultSplit);
  };

  // Pointer drag handler (works for mouse and touch)
  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const newPct = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(minPercent, Math.min(maxPercent, newPct));
      setSplitPercent(clamped);
    };

    const onPointerEnd = () => {
      setIsDragging(false);
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

  // Save after drag finishes
  useEffect(() => {
    if (!isDragging && isMounted) {
      saveSplit(splitPercent);
    }
  }, [isDragging, splitPercent, isMounted, saveSplit]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full flex flex-col lg:flex-row min-w-0 select-none", className)}
      style={{
        userSelect: isDragging ? 'none' : undefined
      }}
    >
      {/* Left Pane (e.g. Sellers) */}
      <div
        className="w-full lg:min-w-0 flex flex-col"
        style={{
          width: isMounted ? `clamp(${minPercent}%, ${splitPercent}%, ${maxPercent}%)` : `${defaultSplit}%`
        }}
      >
        {left}
      </div>

      {/* Draggable Gutter / Splitter */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Потяните влево или вправо для настройки колонок (двойной клик — сброс)"
        onMouseDown={handleStartDrag}
        onTouchStart={handleStartDrag}
        onDoubleClick={handleDoubleClick}
        className={cn(
          "hidden lg:flex items-center justify-center relative cursor-col-resize select-none shrink-0 group z-10",
          "w-3 -mx-1.5 transition-colors touch-none"
        )}
      >
        {/* Visual 1px line */}
        <div
          className={cn(
            "w-[1px] h-full transition-colors",
            isDragging ? "bg-primary w-[2px]" : "bg-border/60 group-hover:bg-primary/80"
          )}
        />
        {/* Grip Handle Pill */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-3.5 h-7 rounded-full border shadow-xs transition-all pointer-events-none",
            isDragging
              ? "bg-primary text-primary-foreground border-primary scale-110 shadow-md ring-2 ring-primary/20"
              : "bg-background text-muted-foreground/80 border-border group-hover:border-primary/50 group-hover:text-primary group-hover:scale-105 group-hover:bg-accent"
          )}
        >
          <GripVertical className="w-2.5 h-2.5" />
        </div>
      </div>

      {/* Mobile Divider (visible on < lg) */}
      <div className="w-full h-px bg-border/40 my-3 lg:hidden" />

      {/* Right Pane (e.g. Metrics) */}
      <div
        className="w-full lg:min-w-0 flex flex-col"
        style={{
          width: isMounted
            ? `calc(${100 - Math.min(maxPercent, Math.max(minPercent, splitPercent))}% - 12px)`
            : `calc(${100 - defaultSplit}% - 12px)`
        }}
      >
        {right}
      </div>
    </div>
  );
}
