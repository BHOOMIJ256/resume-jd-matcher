import React, { useEffect, useState } from "react";
import axios from "axios";
 // Make sure this file exists or remove this line

function Recents() {
  const [recentMatches, setRecentMatches] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:5000/bulk-recents")
      .then((res) => {
        setRecentMatches(res.data.reverse()); // newest first
      })
      .catch((err) => {
        console.error("Error fetching recents:", err);
      });
  }, []);

  return (
    <div className="recents-page">
      <h2>Recent Bulk Analyses</h2>
      <div className="recents-grid">
        {recentMatches.length === 0 ? (
          <p>No recent bulk analyses yet.</p>
        ) : (
          recentMatches.map((match, index) => (
            <div className="recents-card" key={index}>
              <div className="recents-card-header">{match.jobTitle}</div>
              <div className="recents-card-body">
                <div><strong>Date:</strong> {match.date}</div>
                <div><strong>Resumes Processed:</strong> {match.resumesProcessed}</div>
              </div>
              <a
                className="recents-download"
                href={`http://localhost:5000${match.reportUrl}`}

                download
              >
                Download Report
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Recents;
