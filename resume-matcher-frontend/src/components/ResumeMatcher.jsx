// src/components/ResumeMatcher.jsx
import { useState } from "react";
import "./ResumeMatcher.css";

function ResumeMatcher() {
  const [resume, setResume] = useState(null);
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, message: "" });

  const handleSubmit = async () => {
    if (!resume || (!jdText && !jdFile)) {
      setModal({ open: true, message: "Please provide both resume and job description." });
      return;
    }
    const formData = new FormData();
    formData.append("resume", resume);
    if (jdFile) {
      formData.append("job_description", jdFile);
    } else {
      formData.append("jd_text", jdText);
    }
    try {
      setLoading(true);
      setResult(null);
      const response = await fetch("http://localhost:5000/match", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setModal({ open: true, message: "Failed to connect to backend." });
    } finally {
      setLoading(false);
    }
  };

  // Mutually exclusive JD input logic
  const handleJdTextChange = (e) => {
    setJdText(e.target.value);
    if (e.target.value) setJdFile(null);
  };
  const handleJdFileChange = (e) => {
    setJdFile(e.target.files[0]);
    if (e.target.files[0]) setJdText("");
  };

  return (
    <div className="page-wrapper">
      <div className="container">
        <h1 className="heading">Resume Matcher</h1>

        <div>
          <label className="label">Upload Resume (PDF):</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setResume(e.target.files[0])}
            className="input"
          />
        </div>

        <div>
          <label className="label">Paste Job Description (Text):</label>
          <textarea
            value={jdText}
            onChange={handleJdTextChange}
            placeholder="Paste JD here..."
            rows="5"
            className="textarea"
            disabled={!!jdFile}
          />
        </div>

        <div className="or-divider">
          <span className="or-text">OR</span>
        </div>

        <div>
          <label className="label">Upload Job Description (PDF):</label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleJdFileChange}
            className="input"
            disabled={!!jdText}
          />
        </div>

        <button onClick={handleSubmit} className="button">
          Submit for Matching
        </button>

        {loading && <div className="spinner"></div>}

        {result && (
          <div className="result">
            <strong>Score:</strong> {result.score}%
            <br />
            <strong>Verdict:</strong> {result.verdict}
          </div>
        )}

        {/* Modal Popup */}
        {modal.open && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-message">{modal.message}</div>
              <button className="modal-ok" onClick={() => setModal({ open: false, message: "" })}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeMatcher;
