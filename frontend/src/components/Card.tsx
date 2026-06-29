import type { ReactNode } from "react";

interface Props {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Card({ title, action, className = "", children }: Props) {
  return (
    <section className={`card animate-fade-in p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h3 className="panel-title">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
