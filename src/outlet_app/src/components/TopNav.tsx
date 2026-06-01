import { Link, useRouterState } from "@tanstack/react-router";

function Hex() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 1 L18.66 6 V16 L10 21 L1.34 16 V6 Z"
        stroke="#ffff"
        strokeWidth="1.4"
        fill="none"
      />
      <circle cx="10" cy="11" r="2.4" fill="#86bbbd" />
    </svg>
  );
}

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/", label: "Dashboard" },
    { to: "/budget", label: "Budget Allocation" },
    { to: "/xai", label: "XAI Chat" },
  ];

  return (
    <header style={{ backgroundColor: "#141204" }}>
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <Hex />
          <span className="text-lg tracking-tight" style={{ color: "#FFFF", fontFamily: "Syne" }}>
            fih Intelligence
          </span>
        </Link>

        <nav className="flex items-center gap-8">
          {tabs.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="relative py-4 text-sm"
                style={{
                  color: active ? "#ffff" : "#85756e",
                  fontFamily: "Syne",
                  borderBottom: active ? "2px solid #86bbbd" : "2px solid transparent",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="rounded-full border px-3 py-1 text-s font-mono"
        
        >
         
        </div>
      </div>
    </header>
  );
}
