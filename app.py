import os
import asyncio
import httpx
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv

# Import your custom pipeline and data helpers from agents.py
from agents import MultiAgentPipeline, load_data, save_data

# ================== CONFIG & ENVIRONMENT ==================

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))

app = Flask(__name__)

# Fetch API Keys from Render Environment Variables
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Safety Check for Production Deployment
if not NVIDIA_API_KEY or not OPENAI_API_KEY:
    print(f"❌ KEYS STATUS: NVIDIA={'OK' if NVIDIA_API_KEY else 'MISSING'}, OPENAI={'OK' if OPENAI_API_KEY else 'MISSING'}")
    raise ValueError("🚨 Missing API keys! Please check Render Environment Variables.")

# ================== AI PROVIDER SETUP ==================

# Create a custom HTTP client that ignores system proxies.
# This prevents: "TypeError: Client.__init__() got an unexpected keyword argument 'proxies'"
http_client = httpx.Client(proxies={})

ai_providers = {
    "nvidia": {
        "client": OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=NVIDIA_API_KEY,
            http_client=http_client
        ),
        "model": "meta/llama-3.1-8b-instruct"
    },
    "openai": {
        "client": OpenAI(
            api_key=OPENAI_API_KEY,
            http_client=http_client
        ),
        "model": "gpt-4o-mini"
    }
}

# Explicitly used for the RAG / Embedding search logic
embed_client = OpenAI(api_key=OPENAI_API_KEY, http_client=http_client)

# ================== ROUTES ==================

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/generate", methods=["POST"])
async def generate():
    data = request.json
    provider_choice = data.get("model", "nvidia")

    if provider_choice not in ai_providers:
        return jsonify({"error": "Invalid model provider"}), 400

    # Initialize the 5-Agent Multi-Agent Pipeline
    pipeline = MultiAgentPipeline(
        topic=data.get("topic"),
        audience=data.get("audience", "Professional"),
        goal=data.get("goal", "Engagement"),
        content_type=data.get("content_type", "caption"),
        active_client=ai_providers[provider_choice]["client"],
        active_model=ai_providers[provider_choice]["model"],
        embed_client=embed_client
    )

    try:
        # Executes Research, Writing, Critique, SEO, and Art Direction agents
        results = await asyncio.wait_for(
            pipeline.run_full_pipeline(
                data.get("platforms", ["LinkedIn"])
            ),
            timeout=120
        )
        return jsonify(results)

    except asyncio.TimeoutError:
        return jsonify({"error": "Pipeline timed out. Try fewer platforms."}), 500
    except Exception as e:
        print(f"❌ PIPELINE ERROR: {str(e)}")
        return jsonify({"error": f"Generation failed: {str(e)}"}), 500

# ================== RLHF (ADAPTIVE LEARNING) ==================

@app.route("/feedback", methods=["POST"])
def feedback():
    """
    Handles the 'Yes/No' feedback buttons from the UI.
    Updates dataset.json to improve future RAG retrieval scores.
    """
    data = request.json
    target_content = data.get("content")
    new_score = data.get("new_score") # 100 for 'Yes', 10 for 'No'
    
    existing_data = load_data()
    updated = False

    for post in existing_data:
        if post.get("content") == target_content:
            post["predicted_engagement"] = new_score
            updated = True
            break 

    if updated:
        save_data(existing_data)
        print(f"✅ RLHF: Human Feedback recorded. New score for RAG: {new_score}")
        return jsonify({"status": "feedback updated"})
    else:
        return jsonify({"error": "Post not found in database"}), 404

if __name__ == "__main__":
    # Local dev uses debug=True; Render uses gunicorn in requirements.txt
    app.run(debug=True)