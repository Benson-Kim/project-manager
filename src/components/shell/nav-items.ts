/**
 * Navigation registry (STANDARDS §5.3). Module sessions append their entry
 * when their list page lands. Bottom tab bar shows the first four; the rest
 * live under Menu. Desktop sidebar shows all.
 */
export interface NavItem {
  href: string;
  label: string;
}

export const navItems: NavItem[] = [{ href: "/", label: "Home" }];
