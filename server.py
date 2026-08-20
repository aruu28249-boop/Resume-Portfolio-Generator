from flask import Flask, request, jsonify, send_from_directory

from resume_ai import extract_text_from_bytes, get_resume_json

app = Flask(__name__, static_folder=".", static_url_path="")

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/parse-resume", methods=["POST"])
def parse_resume():
    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded under field name 'resume'."}), 400

    file = request.files["resume"]
    if not file.filename:
        return jsonify({"error": "Empty filename."}), 400

    try:
        text = extract_text_from_bytes(file.filename, file.read())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to read file: {e}"}), 500

    return jsonify({"text": text})

@app.route("/api/extract-portfolio", methods=["POST"])
def extract_portfolio():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("text") or "").strip()

    if not resume_text:
        return jsonify({"error": "No resume text provided."}), 400
    if len(resume_text) < 50:
        return jsonify({"error": "Resume text is too short to parse."}), 400

    try:
        data = get_resume_json(resume_text)
    except ValueError as e:
        return jsonify({"error": str(e)}), 502
    except Exception as e:
        return jsonify({"error": f"Gemini request failed: {e}"}), 502

    return jsonify(data)


if __name__ == "__main__":
    import os

    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)


    