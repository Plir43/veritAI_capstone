chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 외부 도메인 이미지 접근 시 CORS 에러 방지를 위해 background에서 fetch 후 Base64로 변환
    if (request.action === "fetchImage") {
        fetch(request.url, { mode: 'cors' })
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => sendResponse({ dataUrl: reader.result });
                reader.readAsDataURL(blob);
            })
            .catch(err => {
                console.error("Image Fetch Error:", err);
                sendResponse({ error: "이미지 로드 실패" });
            });
        return true; // 비동기 응답을 위해 true 반환 (포트 닫힘 방지)
    }

    // 분석 UI 호출 (CSP 제한 우회를 위해 iframe을 감싼 wrapper.html을 엽니다)
    if (request.action === "openAnalyzer") {
        chrome.tabs.create({ url: "wrapper.html" });
        sendResponse({ success: true });
    }
    return true;
});