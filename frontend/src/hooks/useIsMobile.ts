import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

/** A permanent left-rail sidebar doesn't fit a phone-width viewport (confirmed via real device
 * testing — flexbox compresses a fixed-width sidebar and clips its labels). Below 768px, callers
 * should render the sidebar as a collapsible drawer instead. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
