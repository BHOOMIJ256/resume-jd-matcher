// resume-matcher-backend/index.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Endpoint: match resume and JD
app.post('/match', upload.fields([{ name: 'resume' }, { name: 'job_description' }]), async (req, res) => {
  try {
    const resumeFile = req.files['resume']?.[0];
    const jdFile = req.files['job_description']?.[0];
    const jdText = req.body['jd_text'];

    if (!resumeFile) return res.status(400).json({ error: 'Resume not uploaded' });

    const resumeText = await extractPDFText(resumeFile.path);
    const jobDescText = jdFile
      ? await extractPDFText(jdFile.path)
      : jdText || '';

    // Save both texts to temp files to send to Python
    fs.writeFileSync('resume.txt', resumeText);
    fs.writeFileSync('jd.txt', jobDescText);

    // Call Python script to compute similarity
    exec('python3 match.py resume.txt jd.txt', (err, stdout, stderr) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Python matching failed' });
      }

      const [scoreRaw] = stdout.trim().split('\n');
      const score = parseFloat(scoreRaw);
      const verdict = score > 0.75 ? 'Shortlist ' : 'Reject ';

      res.json({ score: Math.round(score * 100), verdict });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

async function extractPDFText(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
