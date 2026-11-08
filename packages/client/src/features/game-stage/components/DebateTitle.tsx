import { useLayoutEffect, useRef, useState } from 'react';
import './DebateTitle.css';

export function DebateTitle({ title }: { readonly title: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    const text = textRef.current;
    if (!heading || !text) return;
    heading.scrollLeft = 0;
    const fit = () => {
      const style = getComputedStyle(heading);
      const width = heading.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      text.style.fontSize = '';
      const naturalWidth = text.getBoundingClientRect().width;
      if (width > 0 && naturalWidth > width) {
        const size = Math.floor(parseFloat(style.fontSize) * width / naturalWidth);
        text.style.fontSize = `${Math.max(16, size)}px`;
      }
      setScrollable(heading.scrollWidth > heading.clientWidth);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [title]);

  return <h1 ref={headingRef} className="versus-topic" tabIndex={scrollable ? 0 : undefined}>
    <span ref={textRef}>{title}</span>
  </h1>;
}
