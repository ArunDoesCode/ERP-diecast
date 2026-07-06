"use client";

import { IconLogout } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useLogoutMutation, useMeQuery } from "@/lib/api/auth/queries";
import { decodeAccessToken, getAccessToken } from "@/lib/auth/token";
import {
  getDefaultShellPagePaths,
  getSidebarSections,
} from "@/lib/navigation/pages";
import { Button } from "../ui/button";
import { ModeToggle } from "../ui/mode-toggle";

export function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logoutMutation = useLogoutMutation();

  // getAccessToken() reads localStorage, which is always null during SSR. Reading it
  // directly in render made the client's first paint differ from the server-rendered
  // HTML (hydration mismatch). Deferring to an effect keeps the first client render
  // identical to the server's, then updates once mounted — same pattern as useIsMobile.
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    setToken(getAccessToken());
  }, []);

  const decodedToken = token ? decodeAccessToken(token) : null;
  const meQuery = useMeQuery(Boolean(token));

  const allowedPagesFromApi = meQuery.data?.data.allowedPages ?? [];
  const allowedPagesFromToken = decodedToken?.allowedPages ?? [];

  const allowedPages =
    allowedPagesFromApi.length > 0
      ? allowedPagesFromApi
      : allowedPagesFromToken.length > 0
        ? allowedPagesFromToken
        : getDefaultShellPagePaths();
  const sidebarSections = getSidebarSections(allowedPages);

  const role = meQuery.data?.data.role ?? decodedToken?.role ?? null;

  return (
    <Sidebar collapsible="offcanvas" className="w-60">
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold">
          {" "}
          {role ? `Role: ${role}` : "Role: -"}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sidebarSections.length > 0 ? (
          sidebarSections.map((section) => (
            <SidebarGroup key={section.module}>
              <SidebarGroupLabel>{section.module}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.pages.map((page) => {
                    const isActive =
                      pathname === page.path ||
                      pathname.startsWith(`${page.path}/`);

                    return (
                      <SidebarMenuItem key={page.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={page.title}
                        >
                          <Link href={page.path}>
                            <span>{page.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No allowed pages found.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-1 text-xs text-muted-foreground"></div>
        <SidebarMenu>
          <SidebarMenuItem className="flex justify-between items-center">
            <Button
              onClick={() => {
                logoutMutation.mutate(undefined, {
                  onSettled: () => {
                    router.replace("/login");
                  },
                });
              }}
              disabled={logoutMutation.isPending}
            >
              <IconLogout />
              <span>
                {logoutMutation.isPending ? "Logging out..." : "Logout"}
              </span>
            </Button>
            <div>
              <ModeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
