import os
import asyncio
import httpx
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
from httpx import Limits

# Import your custom pipeline and MongoDB collection from agents.py
from agents import MultiAgentPipeline, posts_collection

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

# Optimized HTTP Client for Local Windows stability AND Render Cloud HTTPS compatibility
http_client = httpx.Client(
    proxies={}, 
    timeout=60.0,
    limits=Limits(max_connections=10, max_keepalive_connections=5),
    verify=True
)

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
        return jsonify({"error": "Pipeline timed out. The agents took too long to synchronize."}), 500
    except Exception as e:
        print(f"❌ PIPELINE ERROR: {str(e)}")
        return jsonify({"error": f"Generation failed: {str(e)}"}), 500

# ================== RLHF (ADAPTIVE LEARNING) ==================

@app.route("/feedback", methods=["POST"])
def feedback():
    """
    RLHF Cloud Update: Permanently saves human feedback to MongoDB.
    """
    data = request.json
    target_content = data.get("content")
    new_score = data.get("new_score") # 100 for 'Yes', 10 for 'No'
    platform = data.get("platform", "Unknown")
    
    if posts_collection is None:
        return jsonify({"error": "Database not connected"}), 500

    try:
        # Look for the exact post. If found, update its score.
        result = posts_collection.update_one(
            {"content": target_content},
            {"$set": {"predicted_engagement": new_score}}
        )

        # If the post wasn't in the database yet (freshly generated), insert it!
        if result.matched_count == 0:
            posts_collection.insert_one({
                "content": target_content,
                "platform": platform,
                "predicted_engagement": new_score
            })
            print("✅ RLHF: New generated post saved to cloud database.")
        else:
            print(f"✅ RLHF: Existing post updated with score {new_score}.")

        return jsonify({"status": "feedback updated successfully"})
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        return jsonify({"error": "Failed to save feedback"}), 500

if __name__ == "__main__":
    app.run(debug=True)