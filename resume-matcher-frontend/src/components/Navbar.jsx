import { NavLink } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">Resume Matcher Admin</div>
      <div className="navbar-links">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Dashboard
        </NavLink>
        <NavLink to="/recents" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Recents
        </NavLink>
      </div>
    </nav>
  );
}

export default Navbar; 