const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 5000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const llm_context = `You are an experienced headhunter specializing in helping early-career professionals optimize their resumes for job applications. Your goal is to analyze a candidate's resume and compare it to a job description to provide insightful recommendations.

Your output should be structured as follows:

Key Strengths:
- Bullet point list of strengths.

Missing Skills:
- Bullet point list of missing skills.

Recommendations:
- Bullet point list of recommendations.

At the very end of your response, include a match score between 1 and 100 in the following format:
<<MATCH_SCORE:##>>`;


async function analyzeResumeWithGemini(resumeText, jdText) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `${llm_context}\n\nResume:\n${resumeText}\n\nJob Description:\n${jdText}\n\n`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

function extractMatchScore(geminiResponse) {
  const match = geminiResponse.match(/<<MATCH_SCORE:(\d{1,3})>>/);
  return match ? parseInt(match[1]) : 0;
}

// Endpoint: LLM-based detailed match
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

    if (!jobDescText) return res.status(400).json({ error: 'Job description is required' });

    const geminiAnalysis = await analyzeResumeWithGemini(resumeText, jobDescText);

    const matchScore = extractMatchScore(geminiAnalysis);
    const cleanAnalysis = geminiAnalysis.replace(/<<MATCH_SCORE:\d{1,3}>>/, '').trim();
    const verdict = matchScore > 75 ? 'Shortlist' : 'Reject';

    // Clean up
    fs.unlinkSync(resumeFile.path);
    if (jdFile) fs.unlinkSync(jdFile.path);

    res.json({
      score: matchScore,
      verdict,
      analysis: cleanAnalysis
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Endpoint: cosine similarity-based score
app.post('/match-basic', upload.fields([{ name: 'resume' }, { name: 'job_description' }]), async (req, res) => {
  try {
    const resumeFile = req.files['resume']?.[0];
    const jdFile = req.files['job_description']?.[0];
    const jdText = req.body['jd_text'];

    if (!resumeFile) return res.status(400).json({ error: 'Resume not uploaded' });

    const resumeText = await extractPDFText(resumeFile.path);
    const jobDescText = jdFile
      ? await extractPDFText(jdFile.path)
      : jdText || '';

    // Save to temp files for Python
    fs.writeFileSync('resume.txt', resumeText);
    fs.writeFileSync('jd.txt', jobDescText);

    exec('python3 match.py resume.txt jd.txt', (err, stdout, stderr) => {
      fs.unlinkSync(resumeFile.path);
      if (jdFile) fs.unlinkSync(jdFile.path);

      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Python matching failed' });
      }

      const [scoreRaw] = stdout.trim().split('\n');
      const score = parseFloat(scoreRaw);
      const verdict = score > 0.75 ? 'Shortlist' : 'Reject';

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
