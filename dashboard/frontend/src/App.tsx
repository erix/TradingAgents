import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Home from "./pages/Home";
import HistoryPage from "./pages/History";
import RunDetail from "./pages/RunDetail";
import Live from "./pages/Live";

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Header />
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/live" element={<Live />} />
            <Route path="/run/:runId" element={<RunDetail />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
