"""
main.py
-------
CLI entry point: reads resume.txt from the current directory,
sends it to Gemini, and prints the structured JSON.

For the actual web app (index.html + app.js + template1.html),
run server.py instead — that's what serves the /api endpoints
the frontend calls.
"""

import json
from resume_ai import read_resume, get_resume_json

if __name__ == "__main__":
    resume_text = read_resume("resume.txt")
    data = get_resume_json(resume_text)
    print(json.dumps(data, indent=2))


# seventh