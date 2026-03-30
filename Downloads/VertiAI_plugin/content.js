const overlayContainer = document.createElement('div');
overlayContainer.id = 'verit-ai-container';
overlayContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647;';
document.body.appendChild(overlayContainer);

function injectButtons() {
    const items = document.querySelectorAll('video, img');
    
    items.forEach(item => {
        if (item.dataset.veritAdded === "true") return;
        if (item.clientWidth < 50 || item.clientHeight < 50) return;

        const btn = document.createElement("button");
        btn.innerText = "🔍 VeritAI 검사";
        
        // 초기 위치 설정 함수
        const updatePos = () => {
            const rect = item.getBoundingClientRect();
            if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
                btn.style.display = 'none';
                return;
            }
            btn.style.display = 'block';
            btn.style.top = `${rect.top + 10}px`;
            btn.style.left = `${rect.left + 10}px`;
        };

        btn.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            pointer-events: auto;
            background: #ef4444;
            color: white; border: none; padding: 6px 10px;
            border-radius: 4px; cursor: pointer; font-weight: bold;
            font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;

        updatePos();
        
        window.addEventListener('scroll', updatePos, { passive: true });
        window.addEventListener('resize', updatePos, { passive: true });

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            processItem(item);
        };

        overlayContainer.appendChild(btn);
        item.dataset.veritAdded = "true";
    });
}

function processItem(item) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / Math.max(item.naturalWidth || item.videoWidth || 640, item.naturalHeight || item.videoHeight || 480));
    canvas.width = (item.naturalWidth || item.videoWidth || 640) * scale;
    canvas.height = (item.naturalHeight || item.videoHeight || 480) * scale;
    const ctx = canvas.getContext('2d');

    try {
        if (item.tagName === "VIDEO") {
            ctx.drawImage(item, 0, 0, canvas.width, canvas.height);
            chrome.storage.local.set({ targetFrame: canvas.toDataURL('image/jpeg', 0.8) }, () => {
                chrome.runtime.sendMessage({ action: "openAnalyzer" });
            });
        } else {
            chrome.runtime.sendMessage({ action: "fetchImage", url: item.src }, (res) => {
                if (res && res.dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        chrome.storage.local.set({ targetFrame: canvas.toDataURL('image/jpeg', 0.8) }, () => {
                            chrome.runtime.sendMessage({ action: "openAnalyzer" });
                        });
                    };
                    img.src = res.dataUrl;
                }
            });
        }
    } catch (err) {
        alert("이 미디어는 보안 정책(CORS)으로 인해 직접 분석할 수 없습니다.");
    }
}

// 동적 로딩을 위해 옵저버 사용
const observer = new MutationObserver((mutations) => {
    injectButtons();
});
observer.observe(document.body, { childList: true, subtree: true });
injectButtons();