#resume-matcher-backend/match.py
import sys
from sentence_transformers import SentenceTransformer, util

resume_path = sys.argv[1]
jd_path = sys.argv[2]

with open(resume_path, 'r') as f:
    resume_text = f.read()

with open(jd_path, 'r') as f:
    jd_text = f.read()

model = SentenceTransformer('all-MiniLM-L6-v2')
emb1 = model.encode(resume_text, convert_to_tensor=True)
emb2 = model.encode(jd_text, convert_to_tensor=True)

score = util.cos_sim(emb1, emb2).item()
print(score)  # Send back to Node.js
