import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Database,
  FileBarChart,
  Factory,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { pageComponents } from "./pages";
import type { PageName as Page } from "./pages/types";

const groups: {
  title: string;
  items: { label: Page; icon: typeof LayoutDashboard; children?: Page[] }[];
}[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Material Requirement", icon: ClipboardList },
      { label: "Demand Planning", icon: TrendingUp },
    ],
  },
  {
    title: "Supply chain",
    items: [
      { label: "Inventory", icon: Package },
      { label: "Purchase Orders", icon: ShoppingCart },
      { label: "Suppliers", icon: Truck },
      { label: "Production Plan", icon: Factory },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Reports", icon: FileBarChart },
      { label: "Master Data", icon: Database },
      { label: "Project Guides", icon: BookOpen },
      { label: "Settings", icon: Settings },
    ],
  },
];
const routeFor = (page: Page) => `/${page.toLowerCase().replace(/ /g, "-")}`;
const pageFor = (path: string): Page =>
  groups
    .flatMap((group) => group.items)
    .find((item) => routeFor(item.label) === path)?.label ?? "Dashboard";
export default function App() {
  type SignedInUser = {
    email: string;
    display_name: string;
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    role: string;
  };
  type TenantOption = {
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
  };
  const [page, setPage] = useState<Page>(() =>
    pageFor(window.location.pathname),
  );
  const [isLoginRoute, setIsLoginRoute] = useState(
    () => window.location.pathname === "/login",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [authUser, setAuthUser] = useState<SignedInUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [tenantCreateOpen, setTenantCreateOpen] = useState(false);
  const [newTenantCode, setNewTenantCode] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [tenantCreateError, setTenantCreateError] = useState("");
  const [tenantCreateBusy, setTenantCreateBusy] = useState(false);
  useEffect(() => {
    const syncRoute = () => {
      setIsLoginRoute(window.location.pathname === "/login");
      setPage(pageFor(window.location.pathname));
    };
    if (window.location.pathname === "/")
      history.replaceState({}, "", routeFor("Dashboard"));
    else if (
      window.location.pathname !== "/login" &&
      pageFor(window.location.pathname) === "Dashboard" &&
      window.location.pathname !== routeFor("Dashboard")
    )
      history.replaceState({}, "", routeFor("Dashboard"));
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json();
        return body.user as SignedInUser;
      })
      .then((user) => {
        setAuthUser(user);
        if (!user) {
          history.replaceState({}, "", "/login");
          setIsLoginRoute(true);
        } else if (window.location.pathname === "/login") {
          history.replaceState({}, "", routeFor("Dashboard"));
          setIsLoginRoute(false);
        }
      })
      .catch(() => {
        history.replaceState({}, "", "/login");
        setIsLoginRoute(true);
      })
      .finally(() => setAuthChecked(true));
  }, []);
  const changePage = (target: Page) => {
    history.pushState({}, "", routeFor(target));
    setPage(target);
    setSidebarOpen(true);
  };
  if (!authChecked)
    return <div className="auth-loading">Loading workspace…</div>;
  if (isLoginRoute || !authUser)
    return (
      <Login
        onLogin={(user) => {
          setAuthUser(user);
          history.pushState({}, "", routeFor("Dashboard"));
          setIsLoginRoute(false);
          setPage("Dashboard");
        }}
      />
    );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="brand-row">
            <a
              className="brand"
              href={routeFor("Dashboard")}
              onClick={(e) => {
                e.preventDefault();
                changePage("Dashboard");
              }}
            >
              <span className="brand-mark">M</span>
              <span className="brand-name">
                MRP<small>MATERIAL RESOURCE PLANNING</small>
              </span>
            </a>
            <button
              className="icon-button sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={17} />
            </button>
          </div>
          <div className="workspace-select">
            <span className="workspace-icon">
              <Building2 size={16} />
            </span>
            <span className="workspace-text">
              {authUser.tenant_name}
              <small>Tenant · {authUser.tenant_code.toUpperCase()}</small>
            </span>
          </div>
          <div className="side-scroll">
            {groups.map((group) => (
              <section className="nav-group" key={group.title}>
                <div className="nav-heading">{group.title}</div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      className={`nav-item ${page === item.label ? "active" : ""}`}
                      onClick={() => changePage(item.label)}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                      {page === item.label && <span className="active-dot" />}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
          <div className="sidebar-bottom">
            <button
              className="nav-item"
              onClick={() => changePage("Project Guides")}
            >
              <CircleHelp size={17} />
              <span>Help & project guides</span>
            </button>
            <div className="profile-mini">
              <div className="avatar">
                {authUser.display_name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="profile-name">
                {authUser.display_name}
                <small>{authUser.role}</small>
              </div>
              <MoreHorizontal size={17} />
            </div>
          </div>
        </aside>
      )}
      <main
        className={`main-area ${sidebarOpen ? "with-sidebar" : "sidebar-closed"}`}
      >
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation"
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumbs">
              <strong>{page}</strong>
            </div>
          </div>
          <div className="top-actions">
            <div className="env-badge">
              <i /> Production <span>v2.14</span>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => notify("You're all caught up.")}
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="top-divider" />
            {authUser.role === "platform_admin" || authUser.role === "admin" ? (
              <div className="tenant-switcher">
                <button
                  className="org-switch"
                  onClick={async () => {
                    if (!tenantMenuOpen && tenantOptions.length === 0) {
                      try {
                        const response = await fetch("/api/admin/tenants");
                        const body = await response.json();
                        if (!response.ok)
                          throw new Error(
                            body.error || "Could not load workspaces.",
                          );
                        setTenantOptions(body.tenants);
                      } catch (error) {
                        notify(
                          error instanceof Error
                            ? error.message
                            : "Could not load workspaces.",
                        );
                      }
                    }
                    setTenantMenuOpen(!tenantMenuOpen);
                  }}
                  aria-expanded={tenantMenuOpen}
                >
                  <span className="org-logo">
                    {authUser.tenant_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    {authUser.tenant_name}
                    <small className="platform-admin-label">
                      Administrator · choose tenant
                    </small>
                  </span>
                  <ChevronDown size={15} />
                </button>
                {tenantMenuOpen && (
                  <div className="tenant-menu" role="menu">
                    {tenantOptions.map((tenant) => (
                      <button
                        key={tenant.tenant_id}
                        role="menuitem"
                        disabled={tenant.tenant_id === authUser.tenant_id}
                        onClick={async () => {
                          try {
                            const response = await fetch(
                              "/api/admin/active-tenant",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  tenantId: tenant.tenant_id,
                                }),
                              },
                            );
                            const body = await response.json();
                            if (!response.ok)
                              throw new Error(
                                body.error || "Could not switch workspace.",
                              );
                            window.location.reload();
                          } catch (error) {
                            notify(
                              error instanceof Error
                                ? error.message
                                : "Could not switch workspace.",
                            );
                          }
                        }}
                      >
                        {tenant.tenant_code.toUpperCase()} ·{" "}
                        {tenant.tenant_name}
                      </button>
                    ))}
                    <button
                      role="menuitem"
                      className="tenant-add-action"
                      onClick={() => {
                        setTenantMenuOpen(false);
                        setTenantCreateError("");
                        setTenantCreateOpen(true);
                      }}
                    >
                      + Add tenant
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="org-switch"
                aria-label={`Workspace: ${authUser.tenant_name}`}
              >
                <span className="org-logo">
                  {authUser.tenant_name.slice(0, 1).toUpperCase()}
                </span>
                <span>{authUser.tenant_name}</span>
              </div>
            )}
            <button
              className="avatar top-avatar"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setAuthUser(null);
                history.pushState({}, "", "/login");
                setIsLoginRoute(true);
              }}
            >
              {authUser.display_name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </button>
          </div>
        </header>
        <div
          className={`page-wrap ${page.toLowerCase().replace(/ /g, "-")}-wrap`}
        >
          <ModulePage page={page} onNotify={notify} onNavigate={changePage} />
        </div>
      </main>
      {tenantCreateOpen && (
        <div
          className="tenant-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setTenantCreateOpen(false);
          }}
        >
          <form
            className="tenant-create-modal"
            onSubmit={async (event) => {
              event.preventDefault();
              setTenantCreateBusy(true);
              setTenantCreateError("");
              try {
                const createResponse = await fetch("/api/admin/tenants", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenantCode: newTenantCode,
                    tenantName: newTenantName,
                  }),
                });
                const created = await createResponse.json();
                if (!createResponse.ok)
                  throw new Error(created.error || "Could not create tenant.");
                const switchResponse = await fetch("/api/admin/active-tenant", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tenantId: created.tenant.tenant_id }),
                });
                if (!switchResponse.ok) {
                  const switchError = await switchResponse.json();
                  throw new Error(
                    switchError.error ||
                      "Tenant created, but could not switch into it.",
                  );
                }
                window.location.reload();
              } catch (error) {
                setTenantCreateError(
                  error instanceof Error
                    ? error.message
                    : "Could not create tenant.",
                );
              } finally {
                setTenantCreateBusy(false);
              }
            }}
          >
            <div className="tenant-modal-heading">
              <div>
                <span>NEW PLANNING TENANT</span>
                <h2>Add tenant</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setTenantCreateOpen(false)}
              >
                ×
              </button>
            </div>
            <p>
              Each tenant gets its own PostgreSQL schema and starts with empty
              planning data.
            </p>
            <label>
              Tenant code
              <input
                required
                maxLength={40}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={newTenantCode}
                onChange={(event) =>
                  setNewTenantCode(event.target.value.toLowerCase())
                }
                placeholder="mor-cem"
              />
            </label>
            <small className="tenant-code-help">
              Use lowercase letters, numbers, and hyphens.
            </small>
            <label>
              Tenant name
              <input
                required
                maxLength={160}
                value={newTenantName}
                onChange={(event) => setNewTenantName(event.target.value)}
                placeholder="Morocco Cement"
              />
            </label>
            {tenantCreateError && (
              <div className="auth-error" role="alert">
                {tenantCreateError}
              </div>
            )}
            <div className="tenant-modal-actions">
              <button type="button" onClick={() => setTenantCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={tenantCreateBusy}>
                {tenantCreateBusy ? "Creating…" : "Create and open tenant"}
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function ModulePage({
  page,
  onNotify,
  onNavigate,
}: {
  page: Page;
  onNotify: (message: string) => void;
  onNavigate: (target: Page) => void;
}) {
  const Component = pageComponents[page];
  return <Component onNotify={onNotify} onNavigate={onNavigate} />;
}

function Login({
  onLogin,
}: {
  onLogin: (user: {
    email: string;
    display_name: string;
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    role: string;
  }) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not sign in.");
      onLogin(body.user);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand login-brand" href="#home">
          <span className="brand-mark">M</span>
          <span className="brand-name">
            MRP<small>MATERIAL RESOURCE PLANNING</small>
          </span>
        </a>
        <div className="story-content">
          <span className="story-pill">
            <Sparkles size={13} /> PLANNING WITH CLARITY
          </span>
          <h1>
            Better decisions
            <br />
            start with a <em>clear view.</em>
          </h1>
          <p>
            Bring demand, supply and performance into one connected planning
            workspace.
          </p>
          <div className="story-chart">
            <div className="story-chart-caption">
              <span>Forecast confidence</span>
              <strong>
                +18.6% <ArrowDown size={13} />
              </strong>
            </div>
            <div className="story-bars">
              {[30, 45, 38, 54, 46, 63, 55, 70, 59, 77, 67, 87, 76, 96].map(
                (h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ),
              )}
            </div>
            <div className="story-chart-axis">
              <span>JAN</span>
              <span>MAR</span>
              <span>MAY</span>
              <span>JUL</span>
              <span>SEP</span>
            </div>
          </div>
        </div>
        <div className="story-bottom">
          <span>Trusted planning for teams that build what's next.</span>
          <div className="story-avatars">
            <i>JD</i>
            <i>AL</i>
            <i>MK</i>
            <span>+240 teams</span>
          </div>
        </div>
        <div className="login-orb orb-one" />
        <div className="login-orb orb-two" />
      </section>
      <section className="login-main">
        <div className="login-form-wrap">
          <div className="form-welcome">
            <span className="welcome-icon">
              <LockKeyhole size={19} />
            </span>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>Welcome back</h2>
            <p>Sign in to continue to your planning workspace.</p>
          </div>
          <form className="login-form" onSubmit={(e) => void submit(e)}>
            <label>
              Work email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <span className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <div className="form-options">
              <label className="remember">
                <input type="checkbox" defaultChecked />
                <span />
                Remember me
              </label>
              <button type="button" className="forgot-link">
                Forgot password?
              </button>
            </div>
            {authError && (
              <div className="auth-error" role="alert">
                {authError}
              </div>
            )}
            <button
              className="button primary login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Please wait…" : "Sign in"}{" "}
              <ChevronRight size={16} />
            </button>
            <p className="login-help">
              New tenants are created by an administrator after signing in.
            </p>
            <p className="login-help">
              Having trouble signing in?{" "}
              <button>
                Contact your administrator <ArrowLeft size={12} />
              </button>
            </p>
          </form>
        </div>
        <footer className="login-footer">
          <span>(c) 2026 Meridian Planning Cloud</span>
          <span>
            <LockKeyhole size={12} /> Secure, encrypted sign in
          </span>
        </footer>
      </section>
    </main>
  );
}
