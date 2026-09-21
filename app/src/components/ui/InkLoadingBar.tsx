import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useLocation } from "react-router-dom";

export interface InkBarContextType {
  start: () => void;
  finish: () => void;
  setProgress: (p: number) => void;
  isLoading: boolean;
}

const InkBarContext = createContext<InkBarContextType>({
  start: () => {},
  finish: () => {},
  setProgress: () => {},
  isLoading: false,
});

export function useInkBar() {
  return useContext(InkBarContext);
}

/**
 * InkBarProvider provides high-fidelity, liquid ink loading progress feedback
 * across all in-app and product page loads, route changes, and asynchronous operations.
 */
export function InkBarProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgressState] = useState<number>(0);
  const [visible, setVisible] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  };

  const start = useCallback(() => {
    clearTimers();
    setIsFinishing(false);
    setVisible(true);
    setProgressState(14);

    // Natural fluid trickle progression (asymptotically approaches 88%)
    trickleRef.current = setInterval(() => {
      setProgressState((prev) => {
        if (prev >= 88) {
          if (trickleRef.current) {
            clearInterval(trickleRef.current);
            trickleRef.current = null;
          }
          return prev;
        }
        const delta = Math.max(0.8, (90 - prev) * 0.18);
        return Math.min(88, prev + delta);
      });
    }, 140);
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setIsFinishing(true);
    setProgressState(100);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setProgressState(0);
      setIsFinishing(false);
    }, 380);
  }, []);

  const setProgress = useCallback(
    (p: number) => {
      const clamped = Math.min(100, Math.max(0, p));
      setProgressState(clamped);
      if (clamped >= 100) {
        finish();
      } else {
        setVisible(true);
      }
    },
    [finish]
  );

  useEffect(() => {
    return () => clearTimers();
  }, []);

  return (
    <InkBarContext.Provider value={{ start, finish, setProgress, isLoading: visible && !isFinishing }}>
      {children}
      {visible && (
        <div
          className={`ink-bar ${isFinishing ? "ink-bar--finishing" : ""}`}
          role="progressbar"
          aria-label="Loading page"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${progress}%` }}
        >
          <div className="ink-bar__glow" />
          <div className="ink-bar__shimmer" />
          <div className="ink-bar__head" />
        </div>
      )}
    </InkBarContext.Provider>
  );
}

/**
 * InkRouteTracker monitors route changes and automatically triggers the ink
 * loading bar for snappy transitions between in-app pages.
 */
export function InkRouteTracker() {
  const location = useLocation();
  const { start, finish } = useInkBar();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      start();
      const t = setTimeout(() => {
        finish();
      }, 220);
      return () => clearTimeout(t);
    }
  }, [location.pathname, start, finish]);

  return null;
}
