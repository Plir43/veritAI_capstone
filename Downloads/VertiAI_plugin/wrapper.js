// Chrome Storage에서 캡처한 이미지 데이터를 가져와서
// CSP 예외 처리된 iframe(analyzer.html) 내부로 postMessage를 통해 전달
chrome.storage.local.get(['targetFrame'], (res) => {
    if (res.targetFrame) {
        const frame = document.getElementById('sandbox-frame');
        frame.onload = () => {
            frame.contentWindow.postMessage({ 
                action: 'START_ANALYSIS', 
                image: res.targetFrame 
            }, '*');
        };
    }
});