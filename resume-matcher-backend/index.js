//resume-matcher-backend/index.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const { exec } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { GoogleGenerativeAI } = require('@google/generative-ai');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');

const app = express();
const recentBulkAnalyses = [];

const fileFilter = (req, file, cb) => {
  const allowedFields = ['resume', 'jd', 'job_description', 'jobDescription', 'cv', 'document', 'resumes_zip'];
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/zip' // for bulk uploads
  ];
  
  console.log(`File field: ${file.fieldname}, mimetype: ${file.mimetype}`);
  
  if (!allowedFields.includes(file.fieldname)) {
    console.error(`Unexpected field: ${file.fieldname}. Expected: ${allowedFields.join(', ')}`);
    return cb(new Error(`Unexpected field: ${file.fieldname}. Expected: ${allowedFields.join(', ')}`));
  }
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    console.error(`Unsupported file type: ${file.mimetype}`);
    return cb(new Error(`Unsupported file type. Please upload PDF or DOCX files only.`));
  }
  
  cb(null, true);
};

const upload = multer({ 
  dest: 'uploads/',
  fileFilter: fileFilter
});

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

At the very end of your response, include a match score between 1 and 100 in the following format:
<<MATCH_SCORE:##>>`;


async function analyzeResumeWithGemini(resumeText, jdText) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

    const resumeText = await extractTextFromFile(resumeFile.path, resumeFile.originalname);
    const jobDescText = jdFile 
  ? await extractTextFromFile(jdFile.path, jdFile.originalname)
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

    const resumeText = await extractTextFromFile(resumeFile.path, resumeFile.originalname);
    const jobDescText = jdFile 
  ? await extractTextFromFile(jdFile.path, jdFile.originalname)
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

function getAllResumeFiles(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!item.startsWith('.') && !item.startsWith('__MACOSX')) {
            scanDirectory(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          // Accept both .pdf and .docx files
          if ((ext === '.pdf' || ext === '.docx') && stat.size > 0) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.error('Error scanning directory:', currentDir, err);
    }
  }

  scanDirectory(dir);
  return files;
}


// UPDATED: Bulk resume analysis endpoint
app.post('/bulk-match', upload.fields([
  { name: 'resumes_zip', maxCount: 1 },
  { name: 'job_description', maxCount: 1 }
]), async (req, res) => {
  try {
    const zipFile = req.files['resumes_zip']?.[0];
    const jdFile = req.files['job_description']?.[0];
    const jdText = req.body['jd_text'];

    if (!zipFile) return res.status(400).json({ error: 'Zipped resumes not uploaded' });

    // Extract JD text
    let jobDescText = '';
    if (jdFile) {
      try {
        jobDescText = await extractTextFromFile(jdFile.path, jdFile.originalname);
      } catch (err) {
        return res.status(400).json({ error: 'Failed to parse JD file: ' + err.message });
      }
    } else if (jdText) {
      jobDescText = jdText;
    } else {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Unzip resumes
    const zip = new AdmZip(zipFile.path);
    const tempDir = path.join(__dirname, 'uploads', `bulk_${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      zip.extractAllTo(tempDir, true);
      console.log('Zip extracted successfully to:', tempDir);
    } catch (extractError) {
      console.error('Zip extraction error:', extractError);
      fs.unlinkSync(zipFile.path);
      if (jdFile) fs.unlinkSync(jdFile.path);
      return res.status(400).json({ error: 'Failed to extract zip file: ' + extractError.message });
    }

    console.log('Temp directory contents:', fs.readdirSync(tempDir));

    const files = getAllResumeFiles(tempDir);

    console.log('Resume files found:', files.length);
    console.log('Resume file paths:', files);

    if (files.length === 0) {
      const allFiles = getAllFiles(tempDir);
      console.log('All files in directory:', allFiles.length);
      console.log('File types found:', allFiles.map(f => path.extname(f).toLowerCase()));

      fs.unlinkSync(zipFile.path);
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (jdFile) fs.unlinkSync(jdFile.path);
      return res.status(400).json({ 
        error: 'No PDF or DOCX resumes found in zip',
        debug: {
          totalFiles: allFiles.length,
          fileTypes: allFiles.map(f => path.extname(f).toLowerCase()),
          filenames: allFiles.map(f => path.basename(f))
        }
      });
    }

    const results = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const filename = path.relative(tempDir, filePath);
      let row = { filename, score: '', verdict: '', analysis: '', error: '' };
      
      console.log(`Processing file ${i + 1}/${files.length}: ${filename}`);
      
      try {
        let resumeText = '';
        try {
          resumeText = await extractTextFromFile(filePath, filename);
        } catch (err) {
          row.error = 'File parse error: ' + err.message;
          results.push(row);
          continue;
        }
        try {
          const geminiAnalysis = await analyzeResumeWithGemini(resumeText, jobDescText);
          const matchScore = extractMatchScore(geminiAnalysis);
          const cleanAnalysis = geminiAnalysis.replace(/<<MATCH_SCORE:\d{1,3}>>/, '').trim();
          const verdict = matchScore > 75 ? 'Shortlist' : 'Reject';
          row.score = matchScore;
          row.verdict = verdict;
          row.analysis = cleanAnalysis;
        } catch (err) {
          row.error = 'Gemini LLM error: ' + err.message;
        }
      } catch (err) {
        row.error = 'Unknown error: ' + err.message;
      }
      results.push(row);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bulk Analysis');
    worksheet.columns = [
      { header: 'Resume Filename', key: 'filename', width: 30 },
      { header: 'Match Score', key: 'score', width: 12 },
      { header: 'Verdict', key: 'verdict', width: 12 },
      { header: 'Analysis', key: 'analysis', width: 80 },
      { header: 'Error', key: 'error', width: 30 }
    ];
    results.forEach(r => worksheet.addRow(r));

    const reportFilename = `bulk_report_${Date.now()}.xlsx`;
    const reportPath = path.join(__dirname, 'uploads', reportFilename);
    await workbook.xlsx.writeFile(reportPath);

    // ✅ Clean up
    fs.unlinkSync(zipFile.path);
    if (jdFile) fs.unlinkSync(jdFile.path);
    fs.rmSync(tempDir, { recursive: true, force: true });

    // ✅ Track in-memory recents list
    recentBulkAnalyses.unshift({
      jobTitle: req.body.jobName || req.body.job_title || 'Untitled Job',
      date: new Date().toLocaleString(),
      reportUrl: `/download-bulk-report/${reportFilename}`,
      resumesProcessed: results.length
    });
    if (recentBulkAnalyses.length > 10) recentBulkAnalyses.pop();

    // ✅ Save recent bulk analyses to file
    const recentsFilePath = path.join(__dirname, 'data', 'bulk_recent_results.json');
    if (!fs.existsSync(path.dirname(recentsFilePath))) {
    fs.mkdirSync(path.dirname(recentsFilePath), { recursive: true });
    }
    fs.writeFileSync(recentsFilePath, JSON.stringify(recentBulkAnalyses, null, 2));
    // ✅ Send final response
    res.json({
      results,
      reportUrl: `/download-bulk-report/${reportFilename}`
    });

  } catch (error) {
    console.error('Bulk analysis error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Endpoint to download the generated Excel report
app.get('/download-bulk-report/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.download(filePath, filename); // <-- No deletion anymore
});


// Endpoint to fetch recent bulk analyses
app.get("/bulk-recents", (req, res) => {
  const recentsFile = path.join(__dirname, "data", "bulk_recent_results.json");
  if (!fs.existsSync(recentsFile)) return res.json([]);
  try {
    const data = fs.readFileSync(recentsFile, "utf-8");
    res.json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading recents:", error);
    res.status(500).json({ error: "Failed to read recent bulk analyses." });
  }
});

async function extractTextFromFile(filePath, originalName = '') {
  try {
    console.log(`Extracting text from: ${filePath}`);
    
    // Get file extension from original filename or file path
    let fileExtension = path.extname(originalName || filePath).toLowerCase();
    
    console.log('Detected file extension:', fileExtension);

    let extractedText = '';

    if (fileExtension === '.pdf') {
      console.log(`Extracting PDF text from: ${filePath}`);
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      extractedText = data.text;
      console.log('PDF text extracted successfully, length:', extractedText.length);
      
    } else if (fileExtension === '.docx') {
      console.log(`Extracting DOCX text from: ${filePath}`);
      const dataBuffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      extractedText = result.value;
      console.log('DOCX text extracted successfully, length:', extractedText.length);
      
      // Log any messages/warnings from mammoth
      if (result.messages.length > 0) {
        console.log('Mammoth messages:', result.messages);
      }
      
    } else {
      throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: PDF, DOCX`);
    }

    // Clean and validate extracted text
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the file');
    }

    return extractedText.trim();

  } catch (error) {
    console.error(`Error extracting text from ${filePath}:`, error);
    throw new Error(`Failed to extract text from file: ${error.message}`);
  }
}


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));