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

// Function to load recent bulk analyses from file on server startup
function loadRecentBulkAnalyses() {
  const recentsFilePath = path.join(__dirname, 'data', 'bulk_recent_results.json');
  try {
    if (fs.existsSync(recentsFilePath)) {
      const data = fs.readFileSync(recentsFilePath, 'utf-8');
      const loadedData = JSON.parse(data);
      console.log(`Loaded ${loadedData.length} recent bulk analyses from file`);
      return loadedData;
    }
  } catch (error) {
    console.error('Error loading recent bulk analyses:', error);
  }
  return [];
}

// Initialize recentBulkAnalyses with data from file
const recentBulkAnalyses = loadRecentBulkAnalyses();

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

// NEW: Function to parse Gemini response and extract sections
function parseGeminiAnalysis(geminiResponse) {
  try {
    // Remove match score from response
    const cleanResponse = geminiResponse.replace(/<<MATCH_SCORE:\d{1,3}>>/, '').trim();
    
    // Initialize sections
    let keyStrengths = '';
    let missingSkills = '';
    
    // Split by sections using regex to find headers
    const sections = cleanResponse.split(/(?=(?:Key Strengths|Missing Skills):\s*)/i);
    
    for (const section of sections) {
      const trimmedSection = section.trim();
      
      if (trimmedSection.toLowerCase().startsWith('key strengths:')) {
        // Extract everything after "Key Strengths:" until we hit another section or end
        const strengthsMatch = trimmedSection.match(/key strengths:\s*([\s\S]*?)(?=(?:missing skills:|$))/i);
        if (strengthsMatch) {
          keyStrengths = strengthsMatch[1].trim();
        }
      } else if (trimmedSection.toLowerCase().startsWith('missing skills:')) {
        // Extract everything after "Missing Skills:" until end
        const missingMatch = trimmedSection.match(/missing skills:\s*([\s\S]*)/i);
        if (missingMatch) {
          missingSkills = missingMatch[1].trim();
        }
      }
    }
    
    return {
      keyStrengths: keyStrengths || 'No key strengths identified',
      missingSkills: missingSkills || 'No missing skills identified',
      fullAnalysis: cleanResponse // Keep full analysis for backward compatibility
    };
  } catch (error) {
    console.error('Error parsing Gemini analysis:', error);
    // Fallback to original format
    const cleanAnalysis = geminiResponse.replace(/<<MATCH_SCORE:\d{1,3}>>/, '').trim();
    return {
      keyStrengths: 'Error parsing strengths',
      missingSkills: 'Error parsing missing skills',
      fullAnalysis: cleanAnalysis
    };
  }
}

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

// UPDATED: Single resume match endpoint with segregated analysis
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
    const parsedAnalysis = parseGeminiAnalysis(geminiAnalysis);
    const verdict = matchScore > 75 ? 'Shortlist' : 'Reject';

    // Clean up
    fs.unlinkSync(resumeFile.path);
    if (jdFile) fs.unlinkSync(jdFile.path);

    res.json({
      score: matchScore,
      verdict,
      analysis: parsedAnalysis.fullAnalysis,
      keyStrengths: parsedAnalysis.keyStrengths,
      missingSkills: parsedAnalysis.missingSkills
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

// UPDATED: Bulk resume analysis endpoint with segregated columns
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
      let row = { 
        filename, 
        score: '', 
        verdict: '', 
        keyStrengths: '', 
        missingSkills: '', 
        error: '' 
      };
      
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
          const parsedAnalysis = parseGeminiAnalysis(geminiAnalysis);
          const verdict = matchScore > 75 ? 'Shortlist' : 'Reject';
          
          row.score = matchScore;
          row.verdict = verdict;
          row.keyStrengths = parsedAnalysis.keyStrengths;
          row.missingSkills = parsedAnalysis.missingSkills;
        } catch (err) {
          row.error = 'Gemini LLM error: ' + err.message;
        }
      } catch (err) {
        row.error = 'Unknown error: ' + err.message;
      }
      results.push(row);
    }

    // UPDATED: Create Excel with segregated columns
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bulk Analysis');
    worksheet.columns = [
      { header: 'Resume Filename', key: 'filename', width: 30 },
      { header: 'Match Score', key: 'score', width: 12 },
      { header: 'Verdict', key: 'verdict', width: 12 },
      { header: 'Key Strengths', key: 'keyStrengths', width: 50 },
      { header: 'Missing Skills', key: 'missingSkills', width: 50 },
      { header: 'Error', key: 'error', width: 30 }
    ];
    
    // Add rows and format cells for better readability
    results.forEach(r => {
      const row = worksheet.addRow(r);
      
      // Set text wrapping for analysis columns
      row.getCell('keyStrengths').alignment = { wrapText: true, vertical: 'top' };
      row.getCell('missingSkills').alignment = { wrapText: true, vertical: 'top' };
    });
    
    // Set row height for better visibility of wrapped text
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        row.height = 100; // Adjust height as needed
      }
    });

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

    // ✅ Save recent bulk analyses to file (ensure directory exists)
    const recentsFilePath = path.join(__dirname, 'data', 'bulk_recent_results.json');
    const dataDir = path.dirname(recentsFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    try {
      fs.writeFileSync(recentsFilePath, JSON.stringify(recentBulkAnalyses, null, 2));
      console.log('Recent bulk analyses saved successfully');
    } catch (error) {
      console.error('Error saving recent bulk analyses:', error);
    }
    
    // ✅ Save per-resume results to file for future detailed view
    const resultDataPath = path.join(__dirname, 'data', 'bulk_analysis_results');
    if (!fs.existsSync(resultDataPath)) {
    fs.mkdirSync(resultDataPath, { recursive: true });
    }
    const jsonReportName = reportFilename.replace('.xlsx', '.json');
    fs.writeFileSync(path.join(resultDataPath, jsonReportName), JSON.stringify(results, null, 2));

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
  // Always return the in-memory data which is loaded from file on startup
  res.json(recentBulkAnalyses);
});

// Endpoint to fetch detailed JSON results for a bulk report
app.get('/bulk-details/:reportName', (req, res) => {
  const reportName = req.params.reportName;
  const reportFilePath = path.join(__dirname, 'data', 'bulk_analysis_results', `${reportName}.json`);

  if (!fs.existsSync(reportFilePath)) {
    return res.status(404).json({ error: 'Detailed report not found' });
  }

  try {
    const data = fs.readFileSync(reportFilePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("Failed to read detailed report:", err);
    res.status(500).json({ error: 'Failed to load report data.' });
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