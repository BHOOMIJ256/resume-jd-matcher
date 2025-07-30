// components/BulkDetails.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import "./BulkDetails.css"; // Add your styles here

function BulkDetails() {
  const { reportName } = useParams();
  const [data, setData] = useState([]);
  const [selectedResume, setSelectedResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:5000/bulk-details/${reportName}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch bulk details');
        }
        return res.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading bulk details:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [reportName]);

  const handleSelect = (resume) => {
    setSelectedResume(resume);
  };

  const formatAnalysisText = (text) => {
    if (!text || text === 'No key strengths identified' || text === 'No missing skills identified' || text === 'Error parsing strengths' || text === 'Error parsing missing skills') {
      return <em>{text || 'Not available'}</em>;
    }
    
    // Clean and process the text
    const processedText = text
      // First, handle markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold** to <strong>
      .replace(/\*(.*?)\*/g, '<em>$1</em>')             // *italic* to <em>
      .replace(/__(.*?)__/g, '<strong>$1</strong>')     // __bold__ to <strong>
      .replace(/_(.*?)_/g, '<em>$1</em>')               // _italic_ to <em>
      .replace(/`(.*?)`/g, '<code>$1</code>')           // `code` to <code>
      .replace(/#{1,6}\s*(.*)/g, '$1')                  // Remove markdown headers but keep text
      // Clean up any remaining asterisks that aren't part of formatting
      .replace(/\*{3,}/g, '')                           // Remove 3+ consecutive asterisks
      .replace(/(?<!\*)\*(?!\*)/g, '')                  // Remove single asterisks not part of **
      // Standardize bullet points
      .replace(/^\s*[-•*+]\s*/gm, '• ');
    
    const lines = processedText.split('\n').filter(line => line.trim());
    
    return (
      <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
        {lines.map((line, index) => {
          const cleanLine = line.replace(/^[-•*+]\s*/, '').trim();
          if (!cleanLine) return null;
          
          // Render HTML content safely
          return (
            <li 
              key={index} 
              dangerouslySetInnerHTML={{ __html: cleanLine }}
              style={{ marginBottom: '8px', lineHeight: '1.5' }}
            />
          );
        })}
      </ul>
    );
  };

  const getVerdictColor = (verdict) => {
    if (verdict === 'Shortlist') return '#28a745';
    if (verdict === 'Reject') return '#dc3545';
    return '#6c757d';
  };

  const getScoreColor = (score) => {
    if (score >= 75) return '#28a745';
    if (score >= 50) return '#ffc107';
    return '#dc3545';
  };

  if (loading) {
    return (
      <div className="bulk-details-container">
        <div className="loading">Loading bulk analysis details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bulk-details-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bulk-details-container">
      <div className="sidebar">
        <h3>Resumes ({data.length})</h3>
        <ul>
          {data.map((resume, idx) => (
            <li 
              key={idx} 
              onClick={() => handleSelect(resume)}
              className={selectedResume === resume ? 'selected' : ''}
            >
              <div className="resume-item">
                <div className="resume-name">
                  {resume.filename || `Resume ${idx + 1}`}
                </div>
                <div className="resume-meta">
                  <span 
                    className="score-badge"
                    style={{ backgroundColor: getScoreColor(resume.score) }}
                  >
                    {resume.score || 'N/A'}
                  </span>
                  <span 
                    className="verdict-badge"
                    style={{ color: getVerdictColor(resume.verdict) }}
                  >
                    {resume.verdict || 'N/A'}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="detail-view">
        {selectedResume ? (
          <div className="resume-analysis">
            <div className="resume-header">
              <h2>{selectedResume.filename}</h2>
              <div className="resume-stats">
                <div className="stat">
                  <span className="stat-label">Match Score:</span>
                  <span 
                    className="stat-value score"
                    style={{ color: getScoreColor(selectedResume.score) }}
                  >
                    {selectedResume.score || 'N/A'}%
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Verdict:</span>
                  <span 
                    className="stat-value verdict"
                    style={{ color: getVerdictColor(selectedResume.verdict) }}
                  >
                    {selectedResume.verdict || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {selectedResume.error ? (
              <div className="error-section">
                <h3>⚠️ Error</h3>
                <p className="error-message">{selectedResume.error}</p>
              </div>
            ) : (
              <div className="analysis-sections">
                <div className="analysis-section strengths">
                  <h3> Key Strengths</h3>
                  <div className="analysis-content">
                    {formatAnalysisText(selectedResume.keyStrengths)}
                  </div>
                </div>

                <div className="analysis-section missing-skills">
                  <h3>Missing Skills</h3>
                  <div className="analysis-content">
                    {formatAnalysisText(selectedResume.missingSkills)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="placeholder">
            <h3>Select a resume to view detailed analysis</h3>
            <p>Choose a resume from the list on the left to see the detailed breakdown of strengths and missing skills.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkDetails;