export default function Header() {
  return (
    <header className="header">
      <div style={{ fontSize: 14, color: "#94a3b8" }}>
        Multi-Agent LLM Financial Trading Framework
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00c853", display: "inline-block" }} />
        <span style={{ fontSize: 13, color: "#94a3b8" }}>API Online</span>
      </div>
    </header>
  );
}
