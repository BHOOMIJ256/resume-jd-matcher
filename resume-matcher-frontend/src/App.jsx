// resume-matcher-frontend/src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ResumeMatcher from "./components/ResumeMatcher";
import Recents from "./components/Recents";
import BulkDetails from "./components/BulkDetails";

function App() {
  return (
    <Router>
      <div className="app-root">
        <Navbar />
        <div className="main-content">
          <Routes>
            <Route path="/dashboard" element={<ResumeMatcher />} />
            <Route path="/recents" element={<Recents />} />
            <Route path="/details/:reportName" element={<BulkDetails />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
