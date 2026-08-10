import type { PropsWithChildren } from "react";

type Props = PropsWithChildren;

export const MainLayout = ({ children }: Props) => {
  return (
    <div className="app-shell">
      <main className="content">{children}</main>
    </div>
  );
};
