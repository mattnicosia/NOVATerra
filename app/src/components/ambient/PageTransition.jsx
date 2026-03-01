// PageTransition — Route-level entrance animation wrapper
// Applies a smooth fade+scale on mount. Zero-dependency.
// Wraps each page's content for consistent route transitions.
import { useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState('enter'); // 'enter' | 'visible'
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      prevPathRef.current = location.pathname;
      setPhase('enter');
      setDisplayChildren(children);
      // Small raf delay to ensure the 'enter' class is applied before transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhase('visible');
        });
      });
    } else {
      setDisplayChildren(children);
      if (phase === 'enter') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPhase('visible');
          });
        });
      }
    }
  }, [location.pathname, children]);

  return (
    <div
      style={{
        animation: phase === 'enter' ? 'pageEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) both' : undefined,
        minHeight: '100%',
      }}
    >
      {displayChildren}
    </div>
  );
}
