import asyncio
import json
import re
import datetime
import math
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# ================= MONGODB CLOUD SETUP =================
MONGO_URI = os.getenv("MONGO_URI")
try:
    mongo_client = MongoClient(MONGO_URI)
    db = mongo_client.content_flow
    posts_collection = db.posts
except Exception as e:
    print(f"MongoDB connection error: {e}")
    posts_collection = None

# ================= DATA LAYER & ANALYTICS =================
def load_data():
    """Fetches RAG baseline data directly from MongoDB Cloud"""
    if posts_collection is not None:
        try:
            # We exclude '_id' so the output perfectly matches your old JSON format
            return list(posts_collection.find({}, {"_id": 0}))
        except Exception as e:
            print(f"MongoDB read error: {e}")
            return []
    return []

def log(msg):
    print(f"[PIPELINE] {msg}", flush=True)

def record_analytics(topic, platform, content, score):
    """Saves generated content to MongoDB for future RAG"""
    if posts_collection is not None:
        try:
            posts_collection.insert_one({
                "topic": topic,
                "platform": platform,
                "content": content,
                "predicted_engagement": score,
                "timestamp": datetime.datetime.now().isoformat()
            })
        except Exception as e:
            print(f"MongoDB write error: {e}")

# ================= MATH & RULES ENGINE =================
def cosine_similarity(vec1, vec2):
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    return dot_product / (norm1 * norm2) if norm1 != 0 and norm2 != 0 else 0

def rule_score(content, platform):
    score = 50
    if "?" in content: score += 5
    if "!" in content: score += 5
    
    hashtags = len(re.findall(r"#\w+", content))
    score += min(hashtags * 2, 10)
    
    if platform.lower() == "twitter" and len(content) <= 280: score += 10
    if len(content) > 150: score += 5
    return min(score, 100)

# ================= PIPELINE =================
class MultiAgentPipeline:
    MAX_RETRIES = 2

    def __init__(self, topic, audience, goal, content_type, active_client, active_model, embed_client):
        self.topic = topic
        self.audience = audience
        self.goal = goal
        self.content_type = content_type
        self.client = active_client
        self.model = active_model
        self.embed_client = embed_client
        self.semaphore = asyncio.Semaphore(3)

    async def safe_chat(self, prompt, system_prompt="You are an elite, professional AI copywriter and content strategist."):
        async with self.semaphore:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content

    # --- MEMORY AGENT (RAG) ---
    async def retrieve_best_historical_strategy(self, platform):
        log(f"[{platform}] 🔍 Searching Vector DB for past wins...")
        data = load_data()
        if not data: return None

        try:
            res = await asyncio.to_thread(self.embed_client.embeddings.create, input=self.topic, model="text-embedding-3-small")
            current_vector = res.data[0].embedding
        except Exception:
            return None

        best_match = None
        highest_score = -1

        for post in data:
            if post.get("platform") != platform or post.get("predicted_engagement", 0) < 65:
                continue
            try:
                hist_res = await asyncio.to_thread(self.embed_client.embeddings.create, input=post["topic"], model="text-embedding-3-small")
                similarity = cosine_similarity(current_vector, hist_res.data[0].embedding)
                if similarity > highest_score:
                    highest_score = similarity
                    best_match = post
            except Exception:
                continue

        if best_match and highest_score > 0.4:
            log(f"[{platform}] 🎯 RAG Match Found! Mimicking past success.")
            return best_match
        return None

    # --- PREDICTIVE SCORING AGENT ---
    async def llm_score(self, content):
        prompt = f"Estimate engagement score (0-100) for this content. Return JSON: {{\"score\": number}}\n\nContent:\n{content}"
        result = await self.safe_chat(prompt, system_prompt="You are an algorithmic social media analyst.")
        try:
            match = re.search(r"\{.*\}", result, re.DOTALL)
            return json.loads(match.group())["score"]
        except:
            return 70

    async def hybrid_engagement(self, content, platform):
        log(f"[{platform}] 📊 Calculating Hybrid Engagement Score...")
        llm_s = await self.llm_score(content)
        rule_s = rule_score(content, platform)
        final = int((llm_s * 0.6) + (rule_s * 0.4))
        return {"final_score": final, "llm_score": llm_s, "rule_score": rule_s}

    # --- AGENT 1: RESEARCHER ---
    async def intent_agent(self):
        log("🧠 Agent 1: Researcher")
        prompt = f"Analyze intent for Topic: {self.topic}, Audience: {self.audience}. Return JSON: {{\"tone\":\"\", \"structure\":\"\", \"cta\":\"\"}}"
        result = await self.safe_chat(prompt)
        try:
            match = re.search(r"\{.*\}", result, re.DOTALL)
            return json.loads(match.group())
        except:
            return {"tone": "Professional", "structure": "Clear", "cta": "Learn more"}

    # --- AGENT 2: WRITER ---
    async def writer_agent(self, platform, intent, best_past_post):
        log(f"[{platform}] ✍️ Agent 2: Writer")
        prompt = f"Create {platform} {self.content_type} for {self.topic}. Tone: {intent['tone']}. Structure: {intent['structure']}."
        
        # Inject Vector DB context
        if best_past_post:
            prompt += f"\n\nSTUDY THIS HIGH-PERFORMING PAST POST AND MIMIC ITS SUCCESSFUL STYLE:\n{best_past_post['content']}"
            
        return await self.safe_chat(prompt)

    # --- AGENT 3: CRITIC ---
    async def critic_agent(self, content, platform):
        log(f"[{platform}] 🧐 Agent 3: Critic")
        prompt = f"Review this {platform} content. Reply PASS or FIX with 1 sentence suggestion.\nContent: {content}"
        return await self.safe_chat(prompt)

    # --- AGENT 4: SEO ---
    async def seo_agent(self, content, platform):
        log(f"[{platform}] 🚀 Agent 4: SEO")
        prompt = f"Improve hook and add 3 hashtags to: {content}"
        return await self.safe_chat(prompt)

    # --- AGENT 5: ART DIRECTOR ---
    async def art_director_agent(self, content, platform):
        log(f"[{platform}] 🎨 Agent 5: Art Director")
        prompt = f"Write a detailed Midjourney prompt for this content: {content}"
        return await self.safe_chat(prompt)

    # --- THE ORCHESTRATOR ---
    async def generate_for_platform(self, platform):
        best_past_post = await self.retrieve_best_historical_strategy(platform)
        intent = await self.intent_agent()
        content = await self.writer_agent(platform, intent, best_past_post)
        
        for _ in range(self.MAX_RETRIES):
            review = await self.critic_agent(content, platform)
            if "PASS" in review.upper(): break
            content = await self.safe_chat(f"Rewrite this following this feedback: {review}\nOriginal: {content}")

        content = await self.seo_agent(content, platform)
        image_prompt = await self.art_director_agent(content, platform)
        
        prediction = await self.hybrid_engagement(content, platform)
        record_analytics(self.topic, platform, content, prediction["final_score"])

        return {
            "platform": platform,
            "content": content,
            "image_prompt": image_prompt,
            "engagement_prediction": prediction
        }

    async def run_full_pipeline(self, platforms):
        tasks = [self.generate_for_platform(p) for p in platforms]
        return await asyncio.gather(*tasks)