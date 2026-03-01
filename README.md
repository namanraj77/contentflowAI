# Content Flow AI - Multi-Agent Content Orchestrator

Content Flow AI is a scalable, multi-agent AI pipeline designed to generate, critique, and optimize social media content and video scripts. Built with a Flask backend and a responsive Vanilla JS/GSAP frontend, it leverages a 5-agent sequential pipeline to produce platform-specific content, SEO metadata, and Midjourney image prompts.

Instead of relying on static CSV fine-tuning, this system uses **Retrieval-Augmented Generation (RAG)** and a **Reinforcement Learning from Human Feedback (RLHF)** loop to dynamically learn from user preferences in real-time.

---

## Key Features

* **5-Agent Sequential Pipeline**: 
    * **Researcher**: Gathers semantic context and analyzes the topic.
    * **Writer**: Drafts platform-specific copy (LinkedIn, Twitter, IG, Reels, Shorts).
    * **Critic**: Reviews drafts against engagement goals and audience personas.
    * **SEO**: Injects high-performing hashtags and algorithmic triggers.
    * **Art Director**: Generates ready-to-use Midjourney image prompts or video thumbnail concepts.
* **Dynamic RLHF Learning**: Uses a real-time `dataset.json` database. Clicking "Yes/No" in the UI immediately updates engagement scores, teaching the RAG system what "good" looks like without expensive model retraining.
* **Cost-Optimized AI**: Powered by **NVIDIA Llama 3.1 8B Instruct** for heavy generative tasks and OpenAI for high-speed embeddings.
* **Resilient Async Backend**: Configured with custom `httpx` connection limits to prevent Windows Socket errors (10038) and cloud server timeouts.
* **Premium UI/UX**: Built with CSS Grid/Flexbox for perfect alignment, featuring GSAP timeline animations for a polished, modern feel.

---

## Tech Stack

* **Backend**: Python 3.13, Flask, Asyncio, HTTPX
* **AI Models**: NVIDIA NIM API (Llama 3.1 8B), OpenAI API (gpt-4o-mini, text-embedding-3-small)
* **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Grid/Flexbox), GSAP (GreenSock)
* **Deployment Target**: Render (Gunicorn)

---

## Installation & Setup

### 1. Clone the repository
\`\`\`bash
git clone https://github.com/yourusername/content-flow-ai.git
cd content-flow-ai
\`\`\`

### 2. Create a Virtual Environment
\`\`\`bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
\`\`\`

### 3. Install Dependencies
Make sure you have a `requirements.txt` file (see below).
\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 4. Configure Environment Variables
Create a `.env` file in the root directory and add your API keys:
\`\`\`env
NVIDIA_API_KEY=your_nvidia_nim_key_here
OPENAI_API_KEY=your_openai_key_here
\`\`\`

### 5. Run the Local Server
\`\`\`bash
python app.py
\`\`\`
Navigate to `http://127.0.0.1:5000` in your browser.

---

## Deployment (Render)

When deploying to Render, the 5-agent pipeline requires extra time to process multiple platforms simultaneously. Use the following Start Command to prevent `CRITICAL WORKER TIMEOUT` errors:

**Start Command:**
\`\`\`bash
gunicorn app:app --timeout 120 --workers 2 --threads 4
\`\`\`

Ensure your Render environment variables match your `.env` file.

---

## Project Structure

\`\`\`text
content-flow-ai/
│
├── static/
│   ├── style.css         # UI styling, Grid/Flexbox layouts
│   └── script.js         # GSAP animations, API fetch logic, RLHF handlers
│
├── templates/
│   └── index.html        # Main dashboard interface
│
├── app.py                # Flask routes, API endpoints, HTTPX client config
├── agents.py             # MultiAgentPipeline class, Agent prompts, RAG logic
├── dataset.json          # RLHF dynamic memory database
├── requirements.txt      # Python dependencies
└── .env                  # API Keys (Git ignored)
\`\`\`

---

## Why RAG over Fine-Tuning?
This project actively avoids static CSV fine-tuning. By utilizing RAG and JSON-based memory, the agents can cross-reference nested relationships (Content -> Platform -> Score) in real-time. When a user clicks the "Yes" (100% score) or "No" (10% score) feedback buttons, the database is instantly updated, improving the pipeline's future baseline accuracy for a fraction of the compute cost.

---

## License
Created by Naman Raj, Shivam Kumar, Suzain Gupta, Abhay Raj and Kumar Omkar. Open for personal and educational use.
