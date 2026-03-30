const statusMsg = document.getElementById('status-msg');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const trustScoreText = document.getElementById('trust-score');

let progress = 0;
let isEngineReady = false;

// MediaPipe FaceMesh 초기화
const faceMesh = new FaceMesh({
    locateFile: (file) => {
        return `./${file}`; 
    }
});

faceMesh.setOptions({
    maxNumFaces: 1, 
    refineLandmarks: true, 
    minDetectionConfidence: 0.5, 
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

faceMesh.initialize().then(() => {
    isEngineReady = true;
    statusMsg.innerText = "분석 엔진 준비 완료";
    statusMsg.style.color = "#4ade80"; 
}).catch(err => {
    console.error("엔진 로드 실패:", err);
    statusMsg.innerText = "엔진 로드 실패";
    statusMsg.style.color = "#ef4444";
});

function updateProgress(val) {
    progress = Math.min(100, progress + val);
    trustScoreText.innerText = `${Math.round(progress)}%`;
}

// 1차 필터링: 바이트 배열 기반 메타데이터 스캐너
function analyzeExif(base64) {
    try {
        // base64 헤더 제거 후 디코딩
        const raw = atob(base64.split(',')[1]);
        const rawLength = raw.length;
        const scanLength = Math.min(rawLength, 50000); 
        const array = new Uint8Array(new ArrayBuffer(scanLength));
        
        for(let i = 0; i < scanLength; i++) {
            array[i] = raw.charCodeAt(i);
        }

        const decoder = new TextDecoder('ascii');
        const headerText = decoder.decode(array).toLowerCase();
        
        const markers = ["photoshop", "adobe", "midjourney", "stable diffusion", "dall-e", "webui"];
        let found = markers.filter(m => headerText.includes(m));

        const badge = document.getElementById('badge-exif');
        if (found.length > 0) {
            document.getElementById('res-exif').innerHTML = `생성/편집 흔적: <span style="color:#ef4444">${found.join(', ').toUpperCase()}</span>`;
            badge.innerText = "의심"; 
            badge.style.background = "#f59e0b"; 
        } else {
            document.getElementById('res-exif').innerText = "특이 메타데이터 없음";
            badge.innerText = "안전"; 
            badge.style.background = "#22c55e";
        }
    } catch (e) {
        console.error("Exif Analysis Error:", e);
        document.getElementById('res-exif').innerText = "메타데이터 스캔 실패";
    }
    updateProgress(20);
}

// 2차 필터링: 노이즈 분석 및 변동성 히트맵 생성
function analyzeNoise(canvas) {
    try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // 시각화용 히트맵 캔버스 준비
        const hitCanvas = document.createElement('canvas');
        hitCanvas.width = width;
        hitCanvas.height = height;
        const hCtx = hitCanvas.getContext('2d');

        let sumSq = 0, count = 0;
        let suspiciousPoints = 0;

        // 동적 임계값 설정: 해상도가 높을수록 노이즈 허용 범위를 미세하게 조정
        const baseThreshold = 120; 
        const resolutionFactor = Math.sqrt(width * height) / 1000;
        const dynamicThreshold = baseThreshold * resolutionFactor;

        for (let y = 1; y < height - 1; y += 2) {
            for (let x = 1; x < width - 1; x += 2) {
                const idx = (y * width + x) * 4;
                
                // 라플라시안 필터 적용 (엣지 및 고주파 노이즈 추출)
                const gray = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
                const neighbors = [
                    (y-1)*width + x, (y+1)*width + x, y*width + (x-1), y*width + (x+1)
                ].map(i => (0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]));

                const laplacian = Math.abs(neighbors.reduce((a, b) => a + b) - (4 * gray));
                
                sumSq += laplacian * laplacian;
                count++;

                // 이상 노이즈 탐지 및 히트맵 점 찍기
                if (laplacian > dynamicThreshold) {
                    suspiciousPoints++;
                    hCtx.fillStyle = `rgba(255, 0, 0, ${Math.min(laplacian/255, 0.5)})`;
                    hCtx.fillRect(x, y, 2, 2);
                }
            }
        }

        const variance = (sumSq / count); // MSE 기반 분산값
        
        // 원본 캔버스에 히트맵 오버레이
        canvasCtx.globalAlpha = 0.6;
        canvasCtx.drawImage(hitCanvas, 0, 0);
        canvasCtx.globalAlpha = 1.0;

        const badge = document.getElementById('badge-watermark');
        const resText = document.getElementById('res-watermark');
        
        const noiseDensity = (suspiciousPoints / count) * 100;

        if (noiseDensity > 15 || variance > 2500) {
            resText.innerHTML = `고주파 왜곡 감지 (밀도: ${noiseDensity.toFixed(1)}%)`;
            badge.innerText = "의심"; badge.style.background = "#ef4444";
        } else if (variance < 45) {
            resText.innerText = "비정상적 저노이즈(뭉개짐)";
            badge.innerText = "주의"; badge.style.background = "#f59e0b";
        } else {
            resText.innerText = `자연스러운 픽셀 패턴 (Var: ${variance.toFixed(0)})`;
            badge.innerText = "안전"; badge.style.background = "#22c55e";
        }

    } catch (e) {
        console.error("Noise Analysis Error:", e);
    }
    updateProgress(30); 
}

// 3차 필터링: 안면 특징점 추출 및 시각화 콜백
function onResults(results) {
    canvasCtx.save();
    const badge = document.getElementById('badge-geo');
    const resText = document.getElementById('res-geo');

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // 특징점 그리기
        canvasCtx.fillStyle = '#3b82f6';
        for (const point of landmarks) {
            if (point && point.x !== undefined && point.y !== undefined) {
                canvasCtx.beginPath();
                canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 1.2, 0, 2 * Math.PI);
                canvasCtx.fill();
            }
        }
        resText.innerText = "안면 지오메트리 특징점 추출 성공";
        badge.innerText = "성공"; 
        badge.style.background = "#22c55e";
        
        updateProgress(50); 
        statusMsg.innerText = "1차 전처리 분석이 완료되었습니다.";
        statusMsg.style.color = "#60a5fa";

    } else {
        resText.innerText = "얼굴 객체 인식 실패 (풍경/사물 등)";
        badge.innerText = "보류"; 
        badge.style.background = "#94a3b8"; 
        
        updateProgress(50);
        statusMsg.innerText = "안면 비포함 이미지 분석 완료";
        statusMsg.style.color = "#94a3b8";
    }
    canvasCtx.restore();
}

// 메인 실행부 (wrapper.js에서 postMessage로 전달받은 이미지 처리)
window.addEventListener('message', async (event) => {
    if (event.data && event.data.action === 'START_ANALYSIS') {
        document.getElementById('canvas-placeholder').style.display = 'none';
        canvasElement.style.display = 'block';
        statusMsg.innerText = "분석 진행 중...";
        statusMsg.style.color = "#facc15";

        const finalUrl = event.data.image;
        const img = new Image();

        img.onload = async () => {
            // 이미지 크기에 맞춰 캔버스 크기 조정
            canvasElement.width = img.width; 
            canvasElement.height = img.height;
            canvasCtx.drawImage(img, 0, 0); 
            
            // 메타데이터 분석 (동기)
            analyzeExif(finalUrl);
            
            // 픽셀 노이즈 분석 (동기)
            analyzeNoise(canvasElement);

            // 안면 인식 엔진 대기 및 실행 (비동기)
            let attempts = 0;
            while(!isEngineReady && attempts < 50) {
                await new Promise(r => setTimeout(r, 200));
                attempts++;
            }

            if (isEngineReady) {
                try {
                    await faceMesh.send({ image: canvasElement }); 
                } catch (err) {
                    console.error("[Inference Error]:", err);
                    statusMsg.innerText = "안면 추론 엔진 실행 오류";
                    statusMsg.style.color = "#ef4444";
                    updateProgress(40); 
                }
            } else {
                statusMsg.innerText = "엔진 로드 실패";
                statusMsg.style.color = "#ef4444";
                updateProgress(40);
            }
        };
        
        // Base64 데이터 로드 시작
        img.src = finalUrl;
    }
});
