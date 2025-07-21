
// ResumeMatcher.jsx
import { useState } from "react";
import "./ResumeMatcher.css";

function ResumeMatcher() {
  const [tab, setTab] = useState("single");
  // Single analysis states
  const [resume, setResume] = useState(null);
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, message: "" });
  const [analysisMode, setAnalysisMode] = useState("detailed");

  // Bulk analysis states
  const [zipFile, setZipFile] = useState(null);
  const [bulkJdText, setBulkJdText] = useState("");
  const [bulkJdFile, setBulkJdFile] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ processed: 0, total: 0 });
  const [bulkResultFileUrl, setBulkResultFileUrl] = useState(null);

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

      const endpoint = analysisMode === "detailed" ? "/match" : "/match-basic";

      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error:", error);
      setModal({ open: true, message: `Failed to connect to backend: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleJdTextChange = (e) => {
    setJdText(e.target.value);
    if (e.target.value) setJdFile(null);
  };

  const handleJdFileChange = (e) => {
    setJdFile(e.target.files[0]);
    if (e.target.files[0]) setJdText("");
  };

  // Bulk JD handlers
  const handleBulkJdTextChange = (e) => {
    setBulkJdText(e.target.value);
    if (e.target.value) setBulkJdFile(null);
  };
  const handleBulkJdFileChange = (e) => {
    setBulkJdFile(e.target.files[0]);
    if (e.target.files[0]) setBulkJdText("");
  };

  // Bulk analysis submit (connect to backend)
  const handleBulkSubmit = async () => {
    if (!zipFile || (!bulkJdText && !bulkJdFile)) {
      setModal({ open: true, message: "Please provide both zipped resumes and job description." });
      return;
    }
    setBulkLoading(true);
    setBulkProgress({ processed: 0, total: 0 });
    setBulkResultFileUrl(null);
    try {
      const formData = new FormData();
      formData.append("resumes_zip", zipFile);
      if (bulkJdFile) {
        formData.append("job_description", bulkJdFile);
      } else {
        formData.append("jd_text", bulkJdText);
      }
      const response = await fetch("http://localhost:5000/bulk-match", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Show progress as all processed
      setBulkProgress({ processed: data.results.length, total: data.results.length });
      setBulkResultFileUrl(`http://localhost:5000${data.reportUrl}`);
    } catch (error) {
      setModal({ open: true, message: `Bulk analysis failed: ${error.message}` });
    } finally {
      setBulkLoading(false);
    }
  };

  const formatAnalysis = (analysisText) => {
    if (!analysisText) return null;
    const sections = analysisText.split(/(?=Key Strengths:|Missing Skills:|Recommendations:)/g);
    return sections.map((section, index) => {
      if (!section.trim()) return null;
      let sectionClass = "analysis-section";
      if (section.startsWith("Key Strengths:")) sectionClass += " strengths-section";
      else if (section.startsWith("Missing Skills:")) sectionClass += " missing-section";
      else if (section.startsWith("Recommendations:")) sectionClass += " recommendations-section";
      return (
        <div key={index} className={sectionClass}>
          <pre className="analysis-text">{section.trim()}</pre>
        </div>
      );
    }).filter(Boolean);
  };

  return (
    <div className="page-wrapper">
      <div className="container">
        <h1 className="heading">AI Resume Matcher</h1>
        {/* Tab selector */}
        <div className="tab-toggle">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`toggle-btn ${tab === "single" ? "active" : ""}`}
          >
            Single Analysis
          </button>
          <button
            type="button"
            onClick={() => setTab("bulk")}
            className={`toggle-btn ${tab === "bulk" ? "active" : ""}`}
          >
            Bulk Analysis
          </button>
        </div>

        {/* Single Analysis Tab */}
        {tab === "single" && (
          <>
        <div className="analysis-toggle">
          <button
            type="button"
            onClick={() => setAnalysisMode("detailed")}
            className={`toggle-btn ${analysisMode === "detailed" ? "active" : ""}`}
          >
            Detailed Analysis
          </button>
          <button
            type="button"
            onClick={() => setAnalysisMode("basic")}
            className={`toggle-btn ${analysisMode === "basic" ? "active" : ""}`}
          >
            Basic Score
          </button>
        </div>
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
        <button onClick={handleSubmit} className="button" disabled={loading}>
          {loading ? "Analyzing..." : `Analyze Resume (${analysisMode === "detailed" ? "AI Powered" : "Basic Score"})`}
        </button>
        {loading && <div className="spinner"></div>}
        {result && (
          <div className="result">
            <div className="result-header">
              <div className="score-display">
                <strong>Match Score:</strong>
                <span className={`score-value ${result.score > 75 ? "high-score" : result.score > 50 ? "medium-score" : "low-score"}`}>
                  {result.score}%
                </span>
              </div>
              <div className="verdict-display">
                <strong>Verdict:</strong>
                <span className={`verdict-badge ${result.verdict === "Shortlist" ? "shortlist" : "reject"}`}>
                  {result.verdict}
                </span>
              </div>
            </div>
            {result.analysis && (
              <div className="detailed-analysis">
                <h3 className="analysis-title">Detailed Analysis</h3>
                <div className="analysis-content">
                  {formatAnalysis(result.analysis)}
                </div>
              </div>
            )}
          </div>
            )}
          </>
        )}

        {/* Bulk Analysis Tab */}
        {tab === "bulk" && (
          <>
            <div>
              <label className="label">Upload Zipped Resumes (.zip):</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files[0])}
                className="input"
              />
            </div>
            <div>
              <label className="label">Paste Job Description (Text):</label>
              <textarea
                value={bulkJdText}
                onChange={handleBulkJdTextChange}
                placeholder="Paste JD here..."
                rows="5"
                className="textarea"
                disabled={!!bulkJdFile}
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
                onChange={handleBulkJdFileChange}
                className="input"
                disabled={!!bulkJdText}
              />
            </div>
            <button onClick={handleBulkSubmit} className="button" disabled={bulkLoading}>
              {bulkLoading ? `Analyzing...${bulkProgress.total ? ` (${bulkProgress.processed}/${bulkProgress.total} resumes)` : ''}` : "Analyze Bulk Resumes"}
            </button>
            {bulkLoading && (
              <div className="progress-loader">
                <span>{bulkProgress.total ? `Processed: ${bulkProgress.processed}/${bulkProgress.total} resumes` : "Analyzing resumes..."}</span>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(bulkProgress.total ? (bulkProgress.processed / bulkProgress.total) : 0) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
            {bulkResultFileUrl && (
              <div className="download-link">
                <a href={bulkResultFileUrl} download>
                  Download Bulk Analysis Report
                </a>
              </div>
            )}
          </>
        )}

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
