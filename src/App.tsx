import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
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
  Search,
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
  const [page, setPage] = useState<Page>(() =>
    pageFor(window.location.pathname),
  );
  const [isLoginRoute, setIsLoginRoute] = useState(
    () => window.location.pathname === "/login",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState("");
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
  const changePage = (target: Page) => {
    history.pushState({}, "", routeFor(target));
    setPage(target);
    setSidebarOpen(true);
  };
  if (isLoginRoute)
    return (
      <Login
        onLogin={() => {
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
          <button className="workspace-select">
            <span className="workspace-icon">
              <Building2 size={16} />
            </span>
            <span className="workspace-text">
              Holcim Group<small>Demand planning</small>
            </span>
            <ChevronDown size={15} />
          </button>
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
            <button className="nav-item" onClick={() => changePage("Project Guides")}>
              <CircleHelp size={17} />
              <span>Help & project guides</span>
            </button>
            <div className="profile-mini">
              <div className="avatar">RM</div>
              <div className="profile-name">
                Rishi Mishra<small>Planner</small>
              </div>
              <MoreHorizontal size={17} />
            </div>
          </div>
        </aside>
      )}
      <main className={`main-area ${sidebarOpen ? "with-sidebar" : "sidebar-closed"}`}>
        <header
          className={`topbar ${page === "Dashboard" ? "topbar-dashboard" : page === "Material Requirement" ? "topbar-material-requirement" : ""}`}
        >
          <div className="top-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation"
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumbs">
              <span>Demand planning</span>
              <ChevronRight size={14} />
              <strong>{page}</strong>
            </div>
            <label className="global-search">
              <Search size={17} />
              <input placeholder="Search material, part number, supplier..." />
            </label>
          </div>
          <div className="top-actions">
            <button className="dashboard-month">
              <CalendarDays size={16} /> Nov 2026 <ChevronDown size={14} />
            </button>
            <div className="env-badge">
              <i /> Production <span>v2.14</span>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() =>
                notify(
                  "You're all caught up.",
                )
              }
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="top-divider" />
            <button className="org-switch">
              <span className="org-logo">H</span>
              <span>Holcim Group</span>
              <ChevronDown size={15} />
            </button>
            <button
              className="avatar top-avatar"
              onClick={() => {
                history.pushState({}, "", "/login");
                setIsLoginRoute(true);
              }}
            >
              RM
            </button>
          </div>
        </header>
        <div className={`page-wrap ${page.toLowerCase().replace(/ /g, "-")}-wrap`}>
          <ModulePage page={page} onNotify={notify} onNavigate={changePage} />
        </div>
      </main>
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

function Login({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
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
          <span>
            Trusted planning for teams that build
            what's
            next.
          </span>
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
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              onLogin();
            }}
          >
            <label>
              Work email
              <input
                type="email"
                required
                defaultValue="rishi.mishra@holcim.com"
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <span className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  defaultValue="meridian2026"
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
            <button className="button primary login-submit" type="submit">
              Sign in <ChevronRight size={16} />
            </button>
            <div className="sso-divider">
              <span />
              or continue with
              <span />
            </div>
            <button type="button" className="sso-button" onClick={onLogin}>
              <span className="microsoft-mark">
                <i />
                <i />
                <i />
                <i />
              </span>
              Continue with Microsoft
            </button>
            <p className="login-help">
              Having trouble signing in?{" "}
              <button>
                Contact your administrator <ArrowLeft size={12} />
              </button>
            </p>
          </form>
        </div>
        <footer className="login-footer">
          <span>
            (c)
            2026 Meridian Planning Cloud
          </span>
          <span>
            <LockKeyhole size={12} /> Secure, encrypted sign in
          </span>
        </footer>
      </section>
    </main>
  );
}
