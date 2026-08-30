import type { ReactNode } from 'react';
import { cn } from '#/lib/utils';

/**
 * Wraps a product screenshot in browser chrome so landing visuals read as "this is the running
 * app" rather than as a decorative image. The chrome is presentational only and hidden from
 * assistive technology; the screenshot inside carries the alt text.
 */
export function BrowserFrame({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', className)}>
      <div aria-hidden className="flex items-center gap-3 border-b bg-muted px-3 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <span className="mx-auto max-w-[70%] truncate rounded-md bg-background px-3 py-0.5 text-xs text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
