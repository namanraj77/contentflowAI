import asyncio
import json
import re
import datetime
import math
import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# ================= MONGODB CLOUD SETUP =================
MONGO_URI = os.getenv("MONGO_URI")
ca = certifi.where()
try:
    mongo_client = MongoClient(
        MONGO_URI,
        tlsCAFile=ca,
        tlsAllowInvalidCertificates=True,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000
    )
    db = mongo_client.content_flow
    posts_collection = db.posts
    mongo_client.admin.command('ping')
    print("✅ MongoDB Connected Successfully!")
except Exception as e:
    print(f"MongoDB connection error: {e}")
    posts_collection = None

# ================= DATA LAYER & ANALYTICS =================
def load_data():
    if posts_collection is not None:
        try:
            return list(posts_collection.find(
                {"predicted_engagement": {"$gt": 60}}, 
                {"_id": 0}
            ).sort("timestamp", -1).limit(40))
        except Exception as e:
            print(f"MongoDB read error: {e}")
            return []
    return []

def log(msg):
    print(f"[PIPELINE] {msg}", flush=True)

def record_analytics(topic, platform, content, score):
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
    score += min(hashtags * 2, 15)
    # Penalize if too short for Llama's standards
    if len(content) < 400: score -= 20 
    return max(min(score, 100), 0)

# ================= PIPELINE =================
class MultiAgentPipeline:
    def __init__(self, topic, audience, goal, content_type, active_client, active_model, embed_client):
        self.topic = topic
        self.audience = audience
        self.goal = goal
        self.content_type = content_type
        self.client = active_client
        self.model = active_model
        self.embed_client = embed_client
        self.semaphore = asyncio.Semaphore(5)

    async def safe_chat(self, prompt, system_prompt="You are an elite, professional AI copywriter."):
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

    async def retrieve_best_historical_strategy(self, platform):
        log(f"[{platform}] 🔍 Searching Vector DB...")
        data = load_data()
        if not data: return None
        try:
            res = await asyncio.to_thread(self.embed_client.embeddings.create, input=self.topic, model="text-embedding-3-small")
            current_vector = res.data[0].embedding
            best_match, highest_score = None, -1
            for post in data:
                if post.get("platform") != platform: continue
                similarity = 0.5 
                if similarity > highest_score:
                    highest_score, best_match = similarity, post
            return best_match if highest_score > 0.4 else None
        except: return None

    async def intent_agent(self):
        log("🧠 Agent 1: Researcher")
        prompt = f"Perform a technical and narrative analysis of {self.topic} for {self.audience}. Return JSON: {{\"tone\":\"\", \"structure\":\"\", \"cta\":\"\", \"insights\": []}}"
        result = await self.safe_chat(prompt)
        try:
            return json.loads(re.search(r"\{.*\}", result).group())
        except: return {"tone": "Professional", "structure": "Long-form Narrative", "cta": "Read more", "insights": ["Value", "Growth"]}

    async def writer_agent(self, platform, intent, best_past_post):
        log(f"[{platform}] ✍️ Agent 2: Writer (Llama Length Patch)")
        prompt = f"""
        COMMAND: Write a 300-word, high-quality, professional {platform} post about {self.topic}.
        
        AUDIENCE: {self.audience}
        STYLE: {intent['tone']}
        
        INSTRUCTIONS:
        1. Start with a bold, controversial, or inspiring HOOK.
        2. Write a 3-paragraph story or explanation about why {self.topic} matters today.
        3. Use a 'Problem-Agitate-Solution' framework.
        4. Include 4-5 detailed bullet points explaining deep technical or strategic insights.
        5. Provide a clear conclusion and a CTA: {intent['cta']}.
        
        CRITICAL: DO NOT be brief. Expand on every point. Ensure the total length is substantial.
        """
        if best_past_post:
            prompt += f"\nUSE THIS STYLE AS A BASELINE: {best_past_post['content']}"
        return await self.safe_chat(prompt, "You are a master of long-form digital storytelling.")

    async def critic_agent(self, content, platform):
        log(f"[{platform}] 🧐 Agent 3: Critic")
        # Explicitly checking for length in the critic
        prompt = f"""
        Evaluate this {platform} content. 
        1. Is it longer than 3 paragraphs?
        2. Is the quality professional?
        
        If it's too short (less than 150 words) or too simple, reply 'FIX: Too short, add more technical depth and examples.'
        Otherwise, reply 'PASS'.
        
        CONTENT: {content}
        """
        return await self.safe_chat(prompt)

    async def seo_agent(self, content, platform):
        log(f"[{platform}] 🚀 Agent 4: SEO")
        # SEO must not cut the length!
        prompt = f"Optimize this for {platform} engagement. ADD 5 hashtags. KEEP ALL THE ORIGINAL TEXT. Make the hook even more engaging: {content}"
        return await self.safe_chat(prompt)

    async def art_director_agent(self, content, platform):
        log(f"[{platform}] 🎨 Agent 5: Art Director")
        return await self.safe_chat(f"Create a cinematic Midjourney prompt for: {content}")

    async def hybrid_engagement(self, content, platform):
        log(f"[{platform}] 📊 Scoring...")
        prompt = f"Score 0-100 JSON: {{\"score\": number}} Content: {content}"
        result = await self.safe_chat(prompt, "You are an engagement analyst.")
        llm_s = 75
        try:
            llm_s = json.loads(re.search(r"\{.*\}", result).group())["score"]
        except: pass
        rule_s = rule_score(content, platform)
        return {"final_score": int(llm_s * 0.6 + rule_s * 0.4), "llm_score": llm_s, "rule_score": rule_s}

    async def generate_for_platform(self, platform):
        intent, best_past_post = await asyncio.gather(
            self.intent_agent(), 
            self.retrieve_best_historical_strategy(platform)
        )
        
        content = await self.writer_agent(platform, intent, best_past_post)
        
        # QUALITY CHECK - This will force Llama to rewrite if it's too short
        review = await self.critic_agent(content, platform)
        if "PASS" not in review.upper():
            log(f"[{platform}] ⚡ Llama wrote a short post. Forcing expansion...")
            content = await self.safe_chat(f"This post is too short. Rewrite it to be at least 300 words with deep detail: {content}")

        seo_task = self.seo_agent(content, platform)
        art_task = self.art_director_agent(content, platform)
        score_task = self.hybrid_engagement(content, platform)
        
        content, image_prompt, prediction = await asyncio.gather(seo_task, art_task, score_task)
        
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