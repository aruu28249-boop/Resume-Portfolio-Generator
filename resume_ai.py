import io
import json
import os
import re

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

API_KEY = os.getenv("google_api")
if not API_KEY:
    raise ValueError(
        "google_api not found. Add it to your .env file, e.g.\n"
        "  google_api=YOUR_GEMINI_API_KEY"
    )

client = genai.Client(api_key=API_KEY)

MODEL_NAME = "gemini-3.5-flash"


# ---------------------------------------------------------------------
# Text extraction (txt / pdf / docx)
# ---------------------------------------------------------------------

def read_resume(filepath: str) -> str:
    """Read + validate a local resume.txt (used by the CLI)."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        raise ValueError(f"Error: '{filepath}' not found. Please check the file path.")

    return _validate(content)


def extract_text_from_bytes(filename: str, data: bytes) -> str:
    """Extract plain text from an uploaded file's raw bytes.

    Supports .txt, .pdf, and .docx — this is what backs the
    /api/parse-resume endpoint so PDF/DOCX uploads actually work
    instead of silently failing in the browser.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "txt":
        text = data.decode("utf-8", errors="ignore")

    elif ext == "pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

    elif ext == "docx":
        import docx
        document = docx.Document(io.BytesIO(data))
        text = "\n".join(p.text for p in document.paragraphs)

    else:
        raise ValueError(f"Unsupported file type: .{ext}. Please upload a PDF, DOCX, or TXT file.")

    return _validate(text)


def _validate(content: str) -> str:
    cleaned = content.strip()

    if not cleaned:
        raise ValueError("Error: resume is empty. Please add your resume content.")

    MIN_LENGTH = 50
    if len(cleaned) < MIN_LENGTH:
        raise ValueError(
            f"Error: resume seems too short ({len(cleaned)} chars). "
            f"Please provide a complete resume with at least {MIN_LENGTH} characters."
        )

    return cleaned


# ---------------------------------------------------------------------
# Gemini extraction
# ---------------------------------------------------------------------

# NOTE: this schema is intentionally flat and matches the field names
# template1.html's populateFromData() actually reads (title/bio/email
# at top level, education[].school, experience[].bullets,
# projects[].name/tech/description, achievements[].title/sub).

class EducationItem(BaseModel):
    degree: str = ""
    school: str = ""
    year: str = ""


class ExperienceItem(BaseModel):
    role: str = ""
    company: str = ""
    duration: str = ""
    bullets: list[str] = []


class ProjectItem(BaseModel):
    name: str = ""
    description: str = ""
    tech: str = ""
    github: str = ""
    demo: str = ""


class AchievementItem(BaseModel):
    title: str = ""
    sub: str = ""


class ResumeData(BaseModel):
    name: str = ""
    title: str = ""
    bio: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    github: str = ""
    skills: list[str] = []
    education: list[EducationItem] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    achievements: list[AchievementItem] = []


# A single worked example is included directly in the prompt because the
# model was previously chopping numbered/comma-separated resume lines
# (e.g. "1. Student Management System: manage records, attendance and
# grades. 2. Personal Portfolio Website") into the wrong fields —
# splitting mid-sentence at commas/periods and scattering fragments
# across separate project or education entries. The example below shows
# exactly how a numbered list and a multi-line education block should
# collapse into clean, complete entries.
PROMPT_TEMPLATE = """You are a resume parser. Convert the resume text below into a JSON object matching the given schema. Do not invent, assume, or add any information that is not explicitly present in the resume text. If a field has no information, use an empty string "" or empty list [].

CRITICAL RULES — read carefully, these have caused mistakes before:
1. Each numbered or bulleted item (e.g. "1.", "2)", "-") in a "Projects" or "Education" section is exactly ONE entry. Never split a single numbered item into multiple entries, and never let text from one numbered item leak into the previous or next entry.
2. Never split an entry's text at a comma or period unless the resume itself starts a genuinely new item there (e.g. a new number, a new bullet, or a blank line). "Developed a tool to manage records, attendance and grades." is ONE description, not three.
3. Put the one-line project summary in "description", not in "tech" or "name". "tech" is ONLY a short comma-separated list of technology/tool names (e.g. "Python, Flask, SQL") — if no technologies are explicitly named for a project, leave "tech" as "".
4. "name" for a project or "degree"/"school" for education must be a real, complete label copied from the resume — never a lone number, a lone letter, or a sentence fragment like "and grades." or "ment".
5. If a paragraph in the resume runs across multiple lines but is clearly about ONE item (no new number/bullet/heading), treat it as ONE entry and merge the lines together.
6. "linkedin" and "github" should be full URLs if present (e.g. "https://linkedin.com/in/...").
7. "bullets" (experience) should be short responsibility/achievement phrases, not full paragraphs.
8. If a field genuinely isn't present anywhere in the resume, use "" or [] — do not guess or fabricate.

Worked example — given this resume fragment:
\"\"\"
Education:
B.Tech in Computer Science, ABC University, 2022-2026

Projects:
1. Student Management System - Built a tool to manage student records, attendance and grades. Tech: Python, Flask.
2. Personal Portfolio Website - A personal site to showcase work.
\"\"\"
The correct output for those two sections is:
"education": [{{"degree": "B.Tech in Computer Science", "school": "ABC University", "year": "2022-2026"}}]
"projects": [
  {{"name": "Student Management System", "description": "Built a tool to manage student records, attendance and grades.", "tech": "Python, Flask", "github": "", "demo": ""}},
  {{"name": "Personal Portfolio Website", "description": "A personal site to showcase work.", "tech": "", "github": "", "demo": ""}}
]
Notice each numbered item stayed intact as ONE entry, and the description was NOT split at its internal commas.

Return ONLY valid JSON matching the schema. No markdown code fences, no explanations, no extra text before or after the JSON.

Resume text:
\"\"\"
{resume_text}
\"\"\"
"""


def _strip_code_fences(text: str) -> str:
    """Gemini sometimes wraps JSON in ```json ... ``` even when told not to."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


_LEADING_ENUM_RE = re.compile(r"^\s*(?:\d+[.)]|[-•*])\s+")


def _clean_label(value: str) -> str:
    """Strip stray leading numbering ("1. ", "2) ", "- ") that sometimes
    survives into a name/degree/title field, and collapse whitespace."""
    if not isinstance(value, str):
        return value
    value = _LEADING_ENUM_RE.sub("", value.strip())
    return re.sub(r"\s+", " ", value).strip()


def _is_degenerate(value: str) -> bool:
    """Flag obviously-broken fragments: empty, or a lone character/number."""
    if not value:
        return False
    stripped = value.strip()
    if len(stripped) <= 2:
        return True
    return False


def _clean_resume_data(data: dict) -> dict:
    """Post-process the parsed JSON: trim stray numbering off labels and
    drop entries that are clearly fragments rather than real items, so a
    single bad split doesn't render as a garbled card on the portfolio."""
    for proj in data.get("projects", []) or []:
        proj["name"] = _clean_label(proj.get("name", ""))
    data["projects"] = [
        p for p in (data.get("projects") or [])
        if not _is_degenerate(p.get("name", ""))
    ]

    for edu in data.get("education", []) or []:
        edu["degree"] = _clean_label(edu.get("degree", ""))
        edu["school"] = _clean_label(edu.get("school", ""))
    data["education"] = [
        e for e in (data.get("education") or [])
        if not _is_degenerate(e.get("degree", "")) or not _is_degenerate(e.get("school", ""))
    ]

    return data


def get_resume_json(resume_text: str) -> dict:
    """Call Gemini and return a parsed dict matching the schema above."""
    prompt = PROMPT_TEMPLATE.format(resume_text=resume_text)
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ResumeData,
            temperature=0.1,
        ),
    )

    raw = _strip_code_fences(response.text)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini did not return valid JSON: {e}\nRaw response:\n{raw}")

    return _clean_resume_data(data)




