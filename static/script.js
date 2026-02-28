/* ===============================
   GSAP INITIAL LOAD ANIMATIONS
================================= */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Drop the hero title in from the top
    gsap.from(".hero h1", { 
        y: -40, 
        opacity: 0, 
        duration: 1, 
        ease: "power3.out" 
    });

    // 2. Fade the hero paragraph in gently
    gsap.from(".hero p", { 
        y: 20, 
        opacity: 0, 
        duration: 1, 
        delay: 0.2, 
        ease: "power3.out" 
    });

    // 3. Scale up the workspace card
    gsap.from(".workspace-card", { 
        scale: 0.95, 
        opacity: 0, 
        duration: 0.8, 
        delay: 0.4, 
        ease: "power2.out" 
    });

    // 4. Pop the platform chips in one by one (Stagger effect)
    gsap.from(".platform-chip", { 
        opacity: 0, 
        y: 15, 
        stagger: 0.1, 
        delay: 0.8, 
        ease: "back.out(1.5)" 
    });
});

/* ===============================
   MODE SWITCHING
================================= */
let currentMode = "caption";

function switchMode(mode) {
    currentMode = mode;

    const captionBtn = document.getElementById("btnCaption");
    const scriptBtn = document.getElementById("btnScript");
    const captionPlatforms = document.getElementById("captionPlatforms");
    const scriptPlatforms = document.getElementById("scriptPlatforms");

    if (mode === "caption") {
        captionBtn.classList.add("active");
        scriptBtn.classList.remove("active");
        captionPlatforms.style.display = "grid";
        scriptPlatforms.style.display = "none";
    } else {
        scriptBtn.classList.add("active");
        captionBtn.classList.remove("active");
        captionPlatforms.style.display = "none";
        scriptPlatforms.style.display = "grid";
    }
}

/* ===============================
   GENERATE CONTENT
================================= */
async function processPipeline() {
    const topic = document.getElementById("topicInput").value.trim();
    const model = "nvidia"; // Hardcoded to prevent frontend crash
    const audience = document.getElementById("audienceInput").value;
    const goal = document.getElementById("goalInput").value;

    if (!topic) {
        alert("Please enter a topic.");
        return;
    }

    const activeGridId = currentMode === "caption" ? "captionPlatforms" : "scriptPlatforms";
    const activeGrid = document.getElementById(activeGridId);
    
    const checkboxes = activeGrid.querySelectorAll("input:checked");
    const platforms = Array.from(checkboxes).map(cb => cb.value);

    if (platforms.length === 0) {
        alert("Select at least one platform.");
        return;
    }

    const loader = document.getElementById("loader");
    const resultsArea = document.getElementById("resultsArea");
    const followUp = document.getElementById("followUp");
    const btn = document.getElementById("generateBtn");

    loader.style.display = "block";
    resultsArea.innerHTML = "";
    followUp.style.display = "none";
    btn.disabled = true;
    btn.style.opacity = "0.5";

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic,
                audience,
                goal,
                content_type: currentMode,
                model,
                platforms
            })
        });

        const data = await response.json();

        loader.style.display = "none";
        btn.disabled = false;
        btn.style.opacity = "1";

        if (data.error) {
            resultsArea.innerHTML = `<div class="result-card" style="color: #ff6b6b; border-color: #ff6b6b;">${data.error}</div>`;
            return;
        }

        renderResults(data);
        followUp.style.display = "block";

    } catch (error) {
        loader.style.display = "none";
        btn.disabled = false;
        btn.style.opacity = "1";
        resultsArea.innerHTML = `<div class="result-card" style="color: #ff6b6b; border-color: #ff6b6b;">Server error. Please ensure your backend is running.</div>`;
        console.error(error);
    }
}

/* ===============================
   RENDER RESULTS & PREMIUM FEEDBACK UI
================================= */
function renderResults(results) {
    const resultsArea = document.getElementById("resultsArea");

    resultsArea.innerHTML = results.map(item => {
        // Safe score extraction
        let score = 0;
        if (item.engagement_prediction) {
            score = typeof item.engagement_prediction === 'object' 
                ? (item.engagement_prediction.final_score || 0) 
                : item.engagement_prediction;
        }
        
        const encodedContent = encodeURIComponent(item.content).replace(/'/g, "%27");

        let cardHTML = `
            <div class="result-card" style="margin-bottom: 25px; position: relative;">
                <h3 style="margin-bottom: 15px;">${item.platform}</h3>
                <button class="copy-trigger" onclick="copyText(this, decodeURIComponent('${encodedContent}'))">Copy Text</button>
                <div class="result-content" style="margin-bottom: 20px;">${item.content.replace(/\n/g, "<br>")}</div>
                
                <div style="margin-top:25px; padding-top:20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                    
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span style="font-weight:600; color: #3b82f6; font-size: 14px; white-space: nowrap;">
                            🔥 Predicted Engagement: ${score}%
                        </span>
                        ${score > 0 && score < 75 ? `
                            <button class="launch-btn" 
                                    onclick="reOptimize(this, '${item.platform}', decodeURIComponent('${encodedContent}'))" 
                                    style="padding: 4px 10px; font-size: 11px; background: transparent; border: 1px solid #ff6b6b; color: #ff6b6b; width: fit-content;">
                                🔄 Optimize Again
                            </button>` : ''}
                    </div>

                    <div class="feedback-controls" style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 12px; color: var(--muted);">Useful?</span>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 100)" class="platform-chip" style="padding: 5px 15px; margin:0; cursor: pointer;">Yes</button>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 10)" class="platform-chip" style="padding: 5px 15px; margin:0; cursor: pointer;">No</button>
                    </div>
                </div>
            </div>`;
        return cardHTML;
    }).join("");
}
// RLHF Feedback Submission
async function sendFeedback(btn, platform, content, newScore) {
    const originalText = btn.innerText;
    btn.innerText = 'Saving...';
    
    // Disable both buttons in this group
    const controls = btn.parentElement;
    const buttons = controls.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);

    try {
        await fetch("/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                platform: platform,
                content: content,
                new_score: newScore
            })
        });

        // Replace the buttons with a clean success message
        controls.innerHTML = `<span style="color: var(--success); font-weight: 500;">Thanks for the feedback! 🧠</span>`;
    } catch (e) {
        console.error("Feedback failed", e);
        btn.innerText = originalText;
        buttons.forEach(b => b.disabled = false);
    }
}

// Copy to clipboard helper
function copyText(btn, text) {
    const cleanText = text.replace(/<br>/g, '\n');
    navigator.clipboard.writeText(cleanText);
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    btn.style.color = '#34A853';
    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.color = '#9aa0a6';
    }, 2000);
}       
/* ===============================
   KEYBOARD CONTROLS
================================= */
document.getElementById("topicInput").addEventListener("keypress", function(event) {
    // Check if the key pressed is the Enter key
    if (event.key === "Enter") {
        event.preventDefault(); // Stops the browser from reloading the page
        processPipeline();      // Triggers your generation function
    }
});
async function reOptimize(btn, platform, oldContent) {
    const originalText = btn.innerText;
    btn.innerText = "Refining...";
    btn.disabled = true;

    // We send a more specific "Topic" that includes the old content for refinement
    const refinementTopic = `URGENT REFINEMENT: The following content scored low on engagement. Please rewrite it to be significantly more compelling while keeping the core message: "${oldContent}"`;

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: refinementTopic,
                audience: document.getElementById("audienceInput").value,
                goal: "High Engagement",
                content_type: currentMode,
                model: "nvidia", // Staying with the free/stable Llama 3.1
                platforms: [platform]
            })
        });

        const newData = await response.json();
        
        if (newData.error) throw new Error(newData.error);

        // Find the specific card and update its content
        const card = btn.closest('.result-card');
        card.style.borderColor = "var(--primary)";
        card.querySelector('.result-content').innerHTML = newData[0].content.replace(/\n/g, "<br>");
        card.querySelector('span').innerHTML = `🔥 New Predicted Engagement: ${newData[0].engagement_prediction.final_score}%`;
        
        btn.remove(); // Remove the button after successful optimization
    } catch (error) {
        console.error("Optimization failed", error);
        btn.innerText = "Error: Try Again";
        btn.disabled = false;
    }
}