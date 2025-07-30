# Resume-JD Matcher

**Resume-JD Matcher** is a smart AI-powered application that matches candidate resumes with job descriptions and provides insightful analysis. It helps recruiters, hiring managers, and job seekers understand how well a resume fits a given role — along with strengths, weaknesses, and tailored recommendations using an LLM.

---

## Features

-  Upload resumes (individually or in bulk)
-  Upload Job Descriptions (PDF or as text)
-  Automatic resume-to-JD matching
-  AI-generated analysis using Gemini (LLM)
-  Scores & verdicts (e.g., Strong Match, Weak Match)
-  View results in frontend UI
-  Download detailed Excel reports
-  Resume-wise breakdown: strengths, weaknesses, suggestions

---

## Tech Stack

| Layer         | Technology                         |
|---------------|-------------------------------------|
| **Frontend**  | Vite+React.js, CSS                       |
| **Backend**   | Node.js (Express), Gemini AI (LLM)  |
| **File Parsing** | `pdf-parse`, `docx`, `mammoth`   |
| **Excel Reporting** | `exceljs`                    |
| **State Handling** | React Hooks                    |
| **File Storage** | Local uploads directory (can be extended to S3) |

---

## System Architecture

[User Uploads Files] → [Frontend UI (React)]

↓
[Express.js Backend]

↓
[Parse Resume + JD + Call Gemini API]

↓
[Get Score, Verdict, Strengths, Weaknesses]

↓
[Generate Excel Report (ExcelJS)]

↓
[Send Result back to UI for display/download]


## Project Structure



---

## How Matching Works

1. **Text Extraction**: Resume and JD are parsed to extract raw text using `pdf-parse`, `docx`, or `mammoth`.
2. **Embedding & Similarity** *(optional)*: You can add embedding-based similarity using models like `Sentence-BERT` or Gemini.
3. **LLM-Powered Analysis**: Gemini takes in the resume and JD text and generates:
   - Match Score
   - Verdict (e.g., Strong/Moderate/Weak Match)
   - Key Strengths
   - Missing Skills
4. **Output Formatting**: Results are added to Excel with all the metadata.

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/resume-jd-matcher.git
cd resume-jd-matcher
```
### 2. Backent Setup
```bash
cd backend
npm install
```
###  Create a .env file

```bash
PORT=5000
GEMINI_API_KEY=your_api_key_here
```
###  Run Server

```bash
node index.js
```
### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
## API Endpoints 

| Method | Endpoint                          | Description                    |
| ------ | --------------------------------- | ------------------------------ |
| POST   | `/upload-resume-jd`               | Upload single resume and JD    |
| POST   | `/upload-bulk-resumes`            | Upload multiple resumes + JD   |
| GET    | `/download-bulk-report/:filename` | Download Excel analysis file   |
| GET    | `/bulk-details/:filename`         | Fetch resume-wise JSON details |






