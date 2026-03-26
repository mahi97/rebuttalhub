'use client';

import { useRef, useEffect, TextareaHTMLAttributes } from 'react';

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
}

export default function AutoResizeTextarea({ minHeight = 80, value, ...props }: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${Math.max(ref.current.scrollHeight, minHeight)}px`;
    }
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      {...props}
      style={{ ...props.style, minHeight: `${minHeight}px`, overflow: 'hidden' }}
    />
  );
}
