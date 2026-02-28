/* ===============================
   1. GSAP INITIAL LOAD ANIMATIONS
================================= */
document.addEventListener("DOMContentLoaded", () => {
    // Force visibility to prevent "disappearing" elements
    gsap.set(".platform-chip, .hero h1, .hero p, .workspace-card", { opacity: 1 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.from(".hero h1", { y: -50, opacity: 0, duration: 1 })
      .from(".hero p", { y: 30, opacity: 0, duration: 1 }, "-=0.7")
      .from(".workspace-card", { scale: 0.95, opacity: 0, duration: 0.8 }, "-=0.5")
      .from(".platform-chip", { 
          opacity: 0, 
          y: 20, 
          stagger: 0.08, 
          duration: 0.6,
          clearProps: "all" 
      }, "-=0.3");
});

/* ===============================
   2. GLOBAL STATE & MODE SWITCHING
================================= */
let currentMode = "caption";

function switchMode(mode) {
    currentMode = mode;
    console.log("Switching mode to:", mode);

    const captionBtn = document.getElementById("btnCaption");
    const scriptBtn = document.getElementById("btnScript");
    const captionPlatforms = document.getElementById("captionPlatforms");
    const scriptPlatforms = document.getElementById("scriptPlatforms");

    if (mode === "caption") {
        captionBtn.classList.add("active");
        scriptBtn.classList.remove("active");
        captionPlatforms.style.display = "flex";
        scriptPlatforms.style.display = "none";
    } else {
        scriptBtn.classList.add("active");
        captionBtn.classList.remove("active");
        captionPlatforms.style.display = "none";
        scriptPlatforms.style.display = "flex";
    }
}

/* ===============================
   3. CORE PIPELINE EXECUTION
================================= */
async function processPipeline() {
    const topicInput = document.getElementById("topicInput");
    const topic = topicInput.value.trim();
    const btn = document.getElementById("generateBtn");
    
    if (!topic) {
        alert("Please enter a core topic for the agents to analyze.");
        return;
    }

    const activeGridId = currentMode === "caption" ? "captionPlatforms" : "scriptPlatforms";
    const activeGrid = document.getElementById(activeGridId);
    const platforms = Array.from(activeGrid.querySelectorAll("input:checked")).map(cb => cb.value);

    if (platforms.length === 0) {
        alert("Select at least one platform to proceed.");
        return;
    }

    // UI ELEMENTS
    const loader = document.getElementById("loader");
    const resultsArea = document.getElementById("resultsArea");
    const followUp = document.getElementById("followUp");

    // LOCK UI
    btn.disabled = true;
    btn.style.cursor = "not-allowed";
    btn.innerText = "Synchronizing Agents...";
    loader.style.display = "block";
    resultsArea.innerHTML = "";
    followUp.style.display = "none";

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: topic,
                audience: document.getElementById("audienceInput").value,
                goal: document.getElementById("goalInput").value,
                content_type: currentMode,
                model: "nvidia", 
                platforms: platforms
            })
        });

        const data = await response.json();
        
        loader.style.display = "none";
        btn.disabled = false;
        btn.style.cursor = "pointer";
        btn.innerText = "Generate";

        if (data.error) {
            resultsArea.innerHTML = `
                <div class="result-card" style="border-color: #ff6b6b; color: #ff6b6b; padding: 20px; text-align: center;">
                    <strong>Pipeline Interrupted:</strong> ${data.error}
                </div>`;
            return;
        }

        renderResults(data);
        followUp.style.display = "block";

    } catch (error) {
        console.error("Critical Failure:", error);
        loader.style.display = "none";
        btn.disabled = false;
        btn.innerText = "Generate";
        resultsArea.innerHTML = `
            <div class="result-card" style="border-color: #ff6b6b; color: #ff6b6b; padding: 20px; text-align: center;">
                <strong>Network Error:</strong> Ensure your Python Flask server is running locally.
            </div>`;
    }
}

/* ===============================
   4. RENDER RESULTS (THE BIG BLOCK)
================================= */
function renderResults(results) {
    const resultsArea = document.getElementById("resultsArea");

    resultsArea.innerHTML = results.map(item => {
        // Safe handling for different score formats
        let score = 0;
        if (item.engagement_prediction) {
            score = typeof item.engagement_prediction === 'object' 
                ? (item.engagement_prediction.final_score || 0) 
                : item.engagement_prediction;
        }
        
        const encodedContent = encodeURIComponent(item.content).replace(/'/g, "%27");

        let cardHTML = `
            <div class="result-card" style="animation: fadeIn 0.5s ease forwards;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: var(--primary);">${item.platform}</h3>
                    <button class="copy-trigger" onclick="copyText(this, decodeURIComponent('${encodedContent}'))">Copy Text</button>
                </div>
                
                <div class="result-content" style="margin-bottom: 25px; font-size: 15px; line-height: 1.6;">
                    ${item.content.replace(/\n/g, "<br>")}
                </div>`;

        // ART DIRECTOR PROMPT BOX
        if (item.image_prompt) {
            cardHTML += `
                <div style="margin-top: 20px; padding: 18px; background: rgba(0,0,0,0.4); border-left: 4px solid var(--primary); border-radius: 10px; margin-bottom: 25px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong style="color: var(--primary); font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px;">📸 Art Director's Prompt</strong>
                        <button style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--muted); padding: 4px 12px; border-radius: 6px; font-size: 10px; cursor: pointer;" onclick="copyText(this, \`${item.image_prompt.replace(/`/g, '\\`')}\`)">Copy Prompt</button>
                    </div>
                    <p style="font-family: 'Courier New', monospace; font-size: 13px; color: #ced4da; margin: 0; line-height: 1.5;">${item.image_prompt}</p>
                </div>`;
        }

        // FOOTER WITH SPACE-BETWEEN
        cardHTML += `
                <div style="margin-top:30px; padding-top:20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span style="font-weight:700; color: #3b82f6; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                            🔥 Score: ${score}%
                        </span>
                        ${score > 0 && score < 75 ? `
                            <button class="launch-btn" 
                                    onclick="reOptimize(this, '${item.platform}', decodeURIComponent('${encodedContent}'))" 
                                    style="padding: 5px 12px; font-size: 11px; background: transparent; border: 1px solid #ff6b6b; color: #ff6b6b; border-radius: 5px; cursor: pointer;">
                                🔄 Optimize Content
                            </button>` : ''}
                    </div>

                    <div class="feedback-controls" style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 12px; color: var(--muted); font-weight: 500;">Relevant?</span>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 100)" class="platform-chip" style="margin:0; padding: 6px 18px; cursor: pointer; transition: 0.2s;">Yes</button>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 10)" class="platform-chip" style="margin:0; padding: 6px 18px; cursor: pointer; transition: 0.2s;">No</button>
                    </div>
                </div>
            </div>`;
        return cardHTML;
    }).join("");
}

/* ===============================
   5. RE-OPTIMIZATION ENGINE
================================= */
async function reOptimize(btn, platform, oldContent) {
    const originalText = btn.innerText;
    btn.innerText = "Refining with Agents...";
    btn.disabled = true;

    const refinementTopic = `URGENT REFINEMENT: This content scored low. Rewrite it to be 10x more engaging: "${oldContent}"`;

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: refinementTopic,
                audience: document.getElementById("audienceInput").value,
                goal: "High Engagement",
                content_type: currentMode,
                model: "nvidia", 
                platforms: [platform]
            })
        });

        const newData = await response.json();
        const card = btn.closest('.result-card');
        
        // Update the card UI
        card.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.2)";
        card.querySelector('.result-content').innerHTML = newData[0].content.replace(/\n/g, "<br>");
        card.querySelector('span').innerHTML = `🔥 Optimized Score: ${newData[0].engagement_prediction.final_score}%`;
        
        btn.remove(); 
    } catch (error) {
        btn.innerText = "Retry Optimization";
        btn.disabled = false;
    }
}

/* ===============================
   6. UTILITIES (Copy, Feedback, Keys)
================================= */
async function sendFeedback(btn, platform, content, newScore) {
    const controls = btn.parentElement;
    const buttons = controls.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);

    try {
        await fetch("/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, content, new_score: newScore })
        });
        controls.innerHTML = `<span style="color: #34A853; font-weight: 600; font-size: 13px;">Feedback Saved! 🧠</span>`;
    } catch (e) {
        buttons.forEach(b => b.disabled = false);
    }
}

function copyText(btn, text) {
    const cleanText = text.replace(/<br>/g, '\n');
    navigator.clipboard.writeText(cleanText);
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    btn.style.color = '#34A853';
    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.color = '';
    }, 2000);
}

document.getElementById("topicInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") { e.preventDefault(); processPipeline(); }
});