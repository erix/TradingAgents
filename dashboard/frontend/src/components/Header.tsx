import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/history", label: "History" },
];

export default function Header() {
  return (
    <header className="header">
      <div className="top-nav">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </header>
  );
}
