'use client';

import { useRef, useLayoutEffect, useCallback, TextareaHTMLAttributes } from 'react';

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
  maxHeight?: number;
}

function getScrollableAncestors(element: HTMLElement) {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;

    if (canScrollY || canScrollX) {
      ancestors.push(current);
    }

    current = current.parentElement;
  }

  return ancestors;
}

export default function AutoResizeTextarea({
  minHeight = 80,
  maxHeight,
  value,
  ...props
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const scrollSnapshots = getScrollableAncestors(textarea).map((element) => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
    const viewportTop = window.scrollY;
    const viewportLeft = window.scrollX;
    const textareaScrollTop = textarea.scrollTop;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectionDirection = textarea.selectionDirection;

    textarea.style.height = '0px';

    const contentHeight = Math.max(textarea.scrollHeight, minHeight);
    const boundedHeight = maxHeight ? Math.min(contentHeight, maxHeight) : contentHeight;

    textarea.style.height = `${boundedHeight}px`;
    textarea.style.overflowY = maxHeight && contentHeight > maxHeight ? 'auto' : 'hidden';
    textarea.scrollTop = textareaScrollTop;

    if (document.activeElement === textarea && selectionStart !== null && selectionEnd !== null) {
      try {
        textarea.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? 'none');
      } catch {
        // Some browser extensions can briefly interfere with restoring the selection.
      }
    }

    scrollSnapshots.forEach(({ element, top, left }) => {
      if (element.scrollTop !== top) {
        element.scrollTop = top;
      }
      if (element.scrollLeft !== left) {
        element.scrollLeft = left;
      }
    });

    if (window.scrollY !== viewportTop || window.scrollX !== viewportLeft) {
      window.scrollTo(viewportLeft, viewportTop);
    }
  }, [maxHeight, minHeight]);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  return (
    <textarea
      ref={ref}
      value={value}
      {...props}
      style={{
        ...props.style,
        minHeight: `${minHeight}px`,
        ...(maxHeight ? { maxHeight: `${maxHeight}px` } : {}),
        overflowY: 'hidden',
      }}
    />
  );
}
