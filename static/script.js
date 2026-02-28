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
        // FIXED: We now explicitly encode single quotes (%27) so apostrophes don't break the buttons!
        const encodedContent = encodeURIComponent(item.content).replace(/'/g, "%27");

        let cardHTML = `
            <div class="result-card">
                <h3>${item.platform}</h3>
                <button class="copy-trigger" onclick="copyText(this, decodeURIComponent('${encodedContent}'))">Copy Text</button>
                <div class="result-content">${item.content.replace(/\n/g, "<br>")}</div>
                
                <div style="margin-top:25px; padding-top:15px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    <span style="font-weight:600; color: var(--primary); font-size: 14px;">
                        🔥 Predicted Engagement: ${item.engagement_prediction ? item.engagement_prediction.final_score : 'N/A'}%
                    </span>
                    
                    <div class="feedback-controls" style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted);">
                        <span>✨ Did this response hit the mark?</span>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 100)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); padding: 6px 16px; border-radius: 20px; cursor: pointer; transition: 0.2s; font-weight: 500;" onmouseover="this.style.borderColor='var(--success)'; this.style.color='var(--success)';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text)';">Yes</button>
                        <button onclick="sendFeedback(this, '${item.platform}', decodeURIComponent('${encodedContent}'), 10)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); padding: 6px 16px; border-radius: 20px; cursor: pointer; transition: 0.2s; font-weight: 500;" onmouseover="this.style.borderColor='#ff6b6b'; this.style.color='#ff6b6b';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text)';">No</button>
                    </div>
                </div>
        `;

        if (item.image_prompt) {
            cardHTML += `
                <div style="margin-top: 25px; padding: 20px; background: rgba(0,0,0,0.3); border-left: 3px solid var(--primary); border-radius: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: var(--primary); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">📸 Art Director's Image Prompt</strong>
                        <button style="background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;" onclick="copyText(this, \`${item.image_prompt.replace(/`/g, '\\`')}\`)">Copy Prompt</button>
                    </div>
                    <p style="font-family: monospace; font-size: 13px; color: var(--muted); margin: 0; line-height: 1.5;">${item.image_prompt}</p>
                </div>
            `;
        }

        cardHTML += `</div>`;
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