const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const ui = document.getElementById('ui-container');
const uiTitle = document.getElementById('ui-title');
const uiTags = document.getElementById('ui-tags');
const uiFacts = document.getElementById('ui-facts');
const statusTxt = document.getElementById('status');
const missionBox = document.getElementById('mission-box');
const expandButton = document.querySelector('.expand-btn');
const voiceToggleButton = document.getElementById('voice-toggle');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');

const restoreFullscreenButton = document.createElement('button');
restoreFullscreenButton.id = 'restore-fullscreen';
restoreFullscreenButton.type = 'button';
restoreFullscreenButton.textContent = 'Restaurar Tela Cheia';
restoreFullscreenButton.hidden = true;
document.body.appendChild(restoreFullscreenButton);

document.addEventListener('fullscreenchange', () => {
    restoreFullscreenButton.hidden = Boolean(document.fullscreenElement);
});

restoreFullscreenButton.addEventListener('click', () => {
    const fullscreenRequest = document.documentElement.requestFullscreen?.();
    if (fullscreenRequest) {
        fullscreenRequest.catch(() => {});
    }
});

document.addEventListener('touchmove', function(e) {
    if (e.target.closest?.('#ui-facts')) {
        return;
    }
    e.preventDefault();
}, { passive: false });

let currentMolecule = ""; // Guarda a molécula sendo exibida no momento
let vozAtiva = true;
let labStarted = false;
let lineOffset = 0;
let ultimoProcessamento = 0;
const CONNECTION_DELAY_MS = 1500;
const SPEECH_DEBOUNCE_MS = 500;
let speechTimeout = null;
let pendingSpeechMolecule = '';
const GRID_CELL_SIZE = 24;
const closePairSince = new Map();
let particulas = [];
let smoothPoints = {};
let missaoAtual = 0;
let missaoConcluida = false;
let audioContext = null;

expandButton.addEventListener('click', () => {
    window.alert('Em desenvolvimento! Em breve você poderá entrar num laboratório 100% virtual em 360 graus para explorar o interior destas moléculas.');
});

voiceToggleButton.addEventListener('click', () => {
    vozAtiva = !vozAtiva;
    voiceToggleButton.textContent = vozAtiva ? '🔊 Desativar Voz' : '🔇 Ativar Voz';
    voiceToggleButton.setAttribute('aria-label', vozAtiva ? 'Desativar Voz' : 'Ativar Voz');
    voiceToggleButton.setAttribute('aria-pressed', String(vozAtiva));

    if (!vozAtiva) {
        cancelarFalaPendente();
        window.speechSynthesis?.cancel();
    }
});

function startLab(event) {
    let unlockMsg = new SpeechSynthesisUtterance('Áudio ativado');
    unlockMsg.volume = 0;
    window.speechSynthesis.speak(unlockMsg);

    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    }

    if (event.type === 'touchend') {
        event.preventDefault();
    }
    if (labStarted) {
        return;
    }
    labStarted = true;

    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(e => console.log('Bloqueio de rotação não suportado', e));
    }

    startScreen.style.display = 'none';
    canvas.style.display = 'block';
    initCamera();
}

startButton.addEventListener('click', (event) => {
    if (!labStarted) {
        startLab(event);
    }
});
startButton.addEventListener('touchend', startLab, { passive: false });

// 1. Configuração de Cores
const TARGETS = {
    AZUL: { hMin: 160, hMax: 260, sMin: 40, vMin: 35, colorHex: "#00bfff", name: "O/N" },
    VERDE: { hMin: 80, hMax: 140, sMin: 35, vMin: 30, colorHex: "#00cc00", name: "Cl" },
    LARANJA: { hMin: 5, hMax: 45, sMin: 45, vMin: 35, colorHex: "#ff8c00", name: "H/F" }
};

const ATOMOS = {
    AZUL: {
        nome: "Oxigênio (O) ou Nitrogênio (N)",
        fatos: [
            "Possui 2 pinos de ligação física.",
            "O Oxigênio é o gás vital que respiramos todos os dias.",
            "O Nitrogênio compõe quase 80% do ar ao nosso redor!",
            "Geralmente formam gases invisíveis e sem cheiro."
        ]
    },
    VERDE: {
        nome: "Cloro (Cl)",
        fatos: [
            "Possui 6 pinos de ligação física.",
            "Na natureza pura, é um gás amarelo-esverdeado pesado.",
            "É o herói da limpeza: usado para matar bactérias na água da piscina.",
            "Junto com o Sódio, forma o sal que usamos na comida!"
        ]
    },
    LARANJA: {
        nome: "Hidrogênio (H) ou Flúor (F)",
        fatos: [
            "Possui apenas 1 pino de ligação.",
            "O Hidrogênio é o elemento mais leve e abundante de todo o universo!",
            "O Flúor é aquele elemento famoso que protege nossos dentes na pasta de dente.",
            "Eles adoram se ligar rapidamente a outros átomos."
        ]
    }
};

const COMBINACOES = {
    "AZUL_LARANJA": {
        nome: "Água (H₂O)",
        tags: ['💧 Líquido', '🌱 Essencial'],
        fatos: [
            "Ligação: Oxigênio (Azul) + Hidrogênio (Laranja).",
            "Cobre 71% do nosso planeta Terra.",
            "É a única substância comum que existe como sólido, líquido e gás na natureza.",
            "Curiosidade: O gelo flutua porque a água expande quando congela!"
        ]
    },
    "LARANJA_VERDE": {
        nome: "Ácido Clorídrico (HCl)",
        tags: ['⚠️ Ácido', '🧪 Corrosivo'],
        fatos: [
            "Ligação: Hidrogênio (Laranja) + Cloro (Verde).",
            "É um ácido super forte que existe dentro do seu estômago agora mesmo!",
            "Ele ajuda a digerir e quebrar a comida que você come.",
            "Também é usado em produtos de limpeza pesada."
        ]
    },
    "AZUL_VERDE": {
        nome: "Dióxido de Cloro (ClO₂)",
        tags: ['🧪 Desinfetante', '⚠️ Oxidante'],
        fatos: [
            "Ligação: Oxigênio (Azul) + Cloro (Verde).",
            "É um gás avermelhado super poderoso para limpeza.",
            "Usado para purificar água potável pelo mundo todo.",
            "Tem um cheiro muito parecido com o cloro de piscina."
        ]
    },
    "DEFAULT": {
        nome: "Combinação Nova!",
        tags: ['🔬 Em exploração'],
        fatos: [
            "Você conectou dois elementos diferentes.",
            "Os cientistas descobrem novas moléculas testando conexões assim.",
            "Tente descobrir qual é a fórmula química!"
        ]
    }
};

const missoes = [
    { alvo: 'AZUL_LARANJA', texto: 'Missão 1: Crie a molécula da Água (O + H)!' },
    { alvo: 'LARANJA_VERDE', texto: 'Missão 2: Crie a molécula do Ácido Clorídrico (H + Cl)!' },
    { alvo: 'AZUL_VERDE', texto: 'Missão 3: Crie a molécula do Dióxido de Cloro (O + Cl)!' }
];

function playSuccessSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        return;
    }

    if (!audioContext) {
        audioContext = new AudioContextClass();
    }

    const playBeep = () => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const startTime = audioContext.currentTime;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.24);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.25);
    };

    if (audioContext.state === 'suspended') {
        audioContext.resume().then(playBeep).catch(() => {});
    } else {
        playBeep();
    }
}

function falar(texto) {
    if (!window.speechSynthesis) {
        return;
    }
    window.speechSynthesis.cancel();
    if (!vozAtiva) {
        return;
    }
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'pt-BR';
    msg.volume = 1;
    msg.pitch = 1.2;
    msg.rate = 0.9;
    window.speechSynthesis.speak(msg);
}

function cancelarFalaPendente() {
    if (speechTimeout !== null) {
        clearTimeout(speechTimeout);
        speechTimeout = null;
    }
    pendingSpeechMolecule = '';
}

function agendarFalaMolecula(moleculeKey, info) {
    cancelarFalaPendente();
    if (!vozAtiva) {
        return;
    }

    pendingSpeechMolecule = moleculeKey;
    const texto = `Molécula formada: ${info.nome}. ${info.fatos.join('. ')}`;
    speechTimeout = setTimeout(() => {
        speechTimeout = null;
        if (vozAtiva && currentMolecule === moleculeKey && pendingSpeechMolecule === moleculeKey) {
            pendingSpeechMolecule = '';
            falar(texto);
        }
    }, SPEECH_DEBOUNCE_MS);
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) { h = 0; } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, v * 100];
}

function findSpatialClusters(cells, gridColumns, minPixels) {
    const visited = new Set();
    const clusters = [];

    for (const [cellKey, cell] of cells) {
        if (visited.has(cellKey)) {
            continue;
        }

        const pendingCells = [cell];
        visited.add(cellKey);
        const cluster = { x: 0, y: 0, count: 0 };

        while (pendingCells.length > 0) {
            const currentCell = pendingCells.pop();
            cluster.x += currentCell.x;
            cluster.y += currentCell.y;
            cluster.count += currentCell.count;

            for (let offsetY = -1; offsetY <= 1; offsetY++) {
                for (let offsetX = -1; offsetX <= 1; offsetX++) {
                    const neighborX = currentCell.cellX + offsetX;
                    const neighborY = currentCell.cellY + offsetY;
                    if (neighborX < 0 || neighborX >= gridColumns || neighborY < 0) {
                        continue;
                    }

                    const neighborKey = neighborY * gridColumns + neighborX;
                    const neighborCell = cells.get(neighborKey);
                    if (neighborCell && !visited.has(neighborKey)) {
                        visited.add(neighborKey);
                        pendingCells.push(neighborCell);
                    }
                }
            }
        }

        if (cluster.count > minPixels) {
            cluster.x /= cluster.count;
            cluster.y /= cluster.count;
            clusters.push(cluster);
        }
    }

    return clusters.sort((first, second) => first.y - second.y || first.x - second.x);
}

function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

function smoothClusterPoints(colorKey, detectedPoints, amt = 0.25) {
    const previousPoints = smoothPoints[colorKey] || [];
    const matchedPrevious = new Set();
    const maxMatchDistance = GRID_CELL_SIZE * 4;

    const smoothedPoints = detectedPoints.map((point) => {
        let nearestIndex = -1;
        let nearestDistance = maxMatchDistance;

        for (let i = 0; i < previousPoints.length; i++) {
            if (matchedPrevious.has(i)) {
                continue;
            }

            const previousPoint = previousPoints[i];
            const distance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
            if (distance < nearestDistance) {
                nearestIndex = i;
                nearestDistance = distance;
            }
        }

        if (nearestIndex === -1) {
            return point;
        }

        matchedPrevious.add(nearestIndex);
        const previousPoint = previousPoints[nearestIndex];
        return {
            ...point,
            x: lerp(previousPoint.x, point.x, amt),
            y: lerp(previousPoint.y, point.y, amt)
        };
    });

    smoothPoints[colorKey] = smoothedPoints.map(({ x, y, count }) => ({ x, y, count }));
    return smoothedPoints;
}

function criarParticulas(x, y) {
    for (let i = 0; i < 15; i++) {
        let angulo = Math.random() * Math.PI * 2;
        let velocidade = 1 + Math.random() * 2.5;

        particulas.push({
            x,
            y,
            vx: Math.cos(angulo) * velocidade,
            vy: Math.sin(angulo) * velocidade,
            color: Math.random() < 0.5 ? '#4db8ff' : '#ff8c00',
            vida: 1
        });
    }
}

function resizeCanvasToViewport() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const analysisScale = 320 / Math.max(viewportWidth, viewportHeight);

    canvas.width = Math.max(1, Math.round(viewportWidth * analysisScale));
    canvas.height = Math.max(1, Math.round(viewportHeight * analysisScale));
}

window.addEventListener('resize', resizeCanvasToViewport);

function positionUiAt(x, y) {
    const canvasRect = canvas.getBoundingClientRect();
    const screenX = canvasRect.left + (x / canvas.width) * canvasRect.width;
    const screenY = canvasRect.top + (y / canvas.height) * canvasRect.height;
    const leftPos = screenX + 40;
    const maxTop = Math.max(0, window.innerHeight - ui.offsetHeight);

    ui.style.left = `${Math.max(0, Math.min(leftPos, window.innerWidth - ui.offsetWidth - 10))}px`;
    ui.style.top = `${Math.max(0, Math.min(maxTop, screenY - 60))}px`;
}

async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } }
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            resizeCanvasToViewport();
            statusTxt.innerText = "Pronto! Câmera rodando.";
            requestAnimationFrame(processFrame);
        };
    } catch (err) {
        statusTxt.innerText = "Erro na câmera. Verifique permissões.";
    }
}

function processFrame() {
    let agora = Date.now();
    if (agora - ultimoProcessamento < 66) {
        requestAnimationFrame(processFrame);
        return;
    }
    ultimoProcessamento = agora;

    lineOffset += 1;
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    let drawWidth;
    let drawHeight;
    let offsetX;
    let offsetY;

    if (videoAspect > canvasAspect) {
        drawHeight = canvas.height;
        drawWidth = drawHeight * videoAspect;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
    } else {
        drawWidth = canvas.width;
        drawHeight = drawWidth / videoAspect;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
    }

    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    let frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = frameData.data;

    const gridColumns = Math.ceil(canvas.width / GRID_CELL_SIZE);
    let detections = {
        AZUL: new Map(),
        VERDE: new Map(),
        LARANJA: new Map()
    };

    // Varredura de cores
    for (let i = 0; i < pixels.length; i += 64) {
        let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        let [h, s, v] = rgbToHsv(r, g, b);
        const pixelIndex = i / 4;
        let pxX = pixelIndex % canvas.width;
        let pxY = Math.floor(pixelIndex / canvas.width);

        let colorKey = null;
        if (h >= TARGETS.LARANJA.hMin && h <= TARGETS.LARANJA.hMax && s > TARGETS.LARANJA.sMin && v > TARGETS.LARANJA.vMin) {
            colorKey = 'LARANJA';
        }
        else if (h >= TARGETS.VERDE.hMin && h <= TARGETS.VERDE.hMax && s > TARGETS.VERDE.sMin && v > TARGETS.VERDE.vMin) {
            colorKey = 'VERDE';
        }
        else if (h >= TARGETS.AZUL.hMin && h <= TARGETS.AZUL.hMax && s > TARGETS.AZUL.sMin && v > TARGETS.AZUL.vMin) {
            colorKey = 'AZUL';
        }

        if (colorKey) {
            let cellX = Math.floor(pxX / GRID_CELL_SIZE);
            let cellY = Math.floor(pxY / GRID_CELL_SIZE);
            let cellKey = cellY * gridColumns + cellX;
            let cell = detections[colorKey].get(cellKey);

            if (!cell) {
                cell = { cellX, cellY, x: 0, y: 0, count: 0 };
                detections[colorKey].set(cellKey, cell);
            }

            cell.x += pxX;
            cell.y += pxY;
            cell.count++;
        }
    }

    let activePoints = {};

    for (const [colorKey, cells] of Object.entries(detections)) {
        let minPixels = colorKey === 'AZUL' ? 25 : 5;
        let clusters = findSpatialClusters(cells, gridColumns, minPixels);
        if (clusters.length > 0) {
            activePoints[colorKey] = smoothClusterPoints(colorKey, clusters, 0.25);
            for (const point of activePoints[colorKey]) {
                drawCircle(point.x, point.y, TARGETS[colorKey].colorHex, TARGETS[colorKey].name);
            }
        } else {
            delete smoothPoints[colorKey];
        }
    }

    // Calcula a distância entre TODOS os pontos encontrados na tela
    let keys = Object.keys(activePoints);
    let pairConnected = null;
    let pairMidpoint = null;
    let closePairs = new Set();
    let currentTime = performance.now();

    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            let color1 = keys[i];
            let color2 = keys[j];
            let pairKey = [color1, color2].sort().join('_');
            for (let pointIndex1 = 0; pointIndex1 < activePoints[color1].length; pointIndex1++) {
                let p1 = activePoints[color1][pointIndex1];
                for (let pointIndex2 = 0; pointIndex2 < activePoints[color2].length; pointIndex2++) {
                    let p2 = activePoints[color2][pointIndex2];
                    let distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    let pairStateKey = `${color1}:${pointIndex1}|${color2}:${pointIndex2}`;
                    let isConnected = distance < 400;
                    let isValidated = false;

                    if (isConnected) {
                        closePairs.add(pairStateKey);
                        if (!closePairSince.has(pairStateKey)) {
                            closePairSince.set(pairStateKey, currentTime);
                            if ('vibrate' in navigator) navigator.vibrate([50, 100, 50]);
                            criarParticulas((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
                        }
                        isValidated = currentTime - closePairSince.get(pairStateKey) >= CONNECTION_DELAY_MS;
                    }

                    ctx.save();
                    if (isConnected) {
                        ctx.setLineDash([10, 15]);
                        ctx.lineDashOffset = -lineOffset;
                    } else {
                        ctx.setLineDash([]);
                        ctx.lineDashOffset = 0;
                    }
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = isValidated ? "#4db8ff" : "rgba(255, 255, 255, 0.5)";
                    ctx.lineWidth = isValidated ? 4 : 2;
                    ctx.stroke();
                    ctx.restore();

                    if (isValidated) {
                        pairConnected = pairKey;

                        let midX = (p1.x + p2.x) / 2;
                        let midY = (p1.y + p2.y) / 2;
                        pairMidpoint = { x: midX, y: midY };
                        let info = COMBINACOES[pairKey] ? COMBINACOES[pairKey].nome : "Ligação!";

                        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                        ctx.fillRect(midX - 50, midY - 20, 100, 30);
                        ctx.fillStyle = "#4db8ff";
                        ctx.font = "bold 14px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText(info, midX, midY);
                    }
                }
            }
        }
    }

    for (const pairKey of closePairSince.keys()) {
        if (!closePairs.has(pairKey)) {
            closePairSince.delete(pairKey);
        }
    }
    const missao = missoes[missaoAtual];
    if (missao && pairConnected === missao.alvo && !missaoConcluida) {
        missaoConcluida = true;
        missionBox.style.color = '#4db8ff';
        playSuccessSound();

        setTimeout(() => {
            missaoAtual++;
            if (missaoAtual < missoes.length) {
                missionBox.innerText = missoes[missaoAtual].texto;
                missionBox.style.color = '#fff';
                missaoConcluida = false;
            } else {
                missionBox.innerText = 'Parabéns! Você concluiu todas as missões!';
                missionBox.style.color = '#fff';
            }
        }, 4000);
    }

    // Atualiza a Interface UI inferior com base na conexão
    if (!pairConnected) {
        cancelarFalaPendente();
    }

    if (pairConnected) {
        // Prioridade maxima: uma ligação validada.
        const isNewMolecule = currentMolecule !== pairConnected;
        currentMolecule = pairConnected;
        let info = COMBINACOES[pairConnected] || COMBINACOES["DEFAULT"];
        let tagsHtml = info.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        let factsHtml = info.fatos.map(fato => `<li>${fato}</li>`).join('');
        if (uiTitle.innerText !== info.nome) {
            uiTitle.innerText = info.nome;
        }
        if (uiTags.innerHTML !== tagsHtml) {
            uiTags.innerHTML = tagsHtml;
        }
        if (uiFacts.innerHTML !== factsHtml) {
            uiFacts.innerHTML = factsHtml;
        }
        uiTitle.style.color = '#4db8ff';
        if (isNewMolecule) {
            agendarFalaMolecula(pairConnected, info);
        }
        if (ui.style.display !== 'block') {
            ui.style.display = 'block';
        }
        if (pairMidpoint) {
            positionUiAt(pairMidpoint.x, pairMidpoint.y);
        }
    } else if (Object.keys(activePoints).length > 0) {
        // Sem ligação: exibe o átomo predominante.
        let colorCounts = Object.fromEntries(Object.entries(activePoints).map(([color, points]) => (
            [color, points.reduce((total, point) => total + point.count, 0)]
        )));
        let dominantColor = Object.keys(colorCounts).reduce((dominant, color) => (
            colorCounts[color] > colorCounts[dominant] ? color : dominant
        ));
        const isNewAtom = currentMolecule !== dominantColor;
        currentMolecule = dominantColor;
        let info = ATOMOS[dominantColor];
        let factsHtml = info.fatos.map(fato => `<li>${fato}</li>`).join('');
        if (uiTitle.innerText !== info.nome) {
            uiTitle.innerText = info.nome;
        }
        if (uiFacts.innerHTML !== factsHtml) {
            uiFacts.innerHTML = factsHtml;
        }
        uiTitle.style.color = TARGETS[dominantColor].colorHex;
        if (isNewAtom) {
            falar(`${info.nome}. ${info.fatos[0]}`);
        }
        if (uiTags.innerHTML) {
            uiTags.innerHTML = '';
        }
        if (ui.style.display !== 'block') {
            ui.style.display = 'block';
        }
        const largestSpot = activePoints[dominantColor].reduce((largest, point) => (
            point.count > largest.count ? point : largest
        ));
        const cx = largestSpot.x;
        const cy = largestSpot.y;
        positionUiAt(cx, cy);
    } else {
        // Sem detecções: limpa o estado e oculta o painel.
        currentMolecule = "";
        if (ui.style.display !== 'none') {
            ui.style.display = 'none';
        }
    }

    for (let i = particulas.length - 1; i >= 0; i--) {
        let particula = particulas[i];

        ctx.save();
        ctx.globalAlpha = Math.max(particula.vida, 0);
        ctx.fillStyle = particula.color;
        ctx.beginPath();
        ctx.arc(particula.x, particula.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        particula.x += particula.vx;
        particula.y += particula.vy;
        particula.vida -= 0.025;

        if (particula.vida <= 0) {
            particulas.splice(i, 1);
        }
    }

    requestAnimationFrame(processFrame);
}

function drawCircle(x, y, color, name) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Date.now() * 0.0002);
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 27, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x, y);
}
