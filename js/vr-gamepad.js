const pressedGamepads = new Set();

function activateCursorTarget() {
    const cursor = document.querySelector('a-cursor');
    const target = cursor?.components.cursor?.intersectedEl;
    const backLink = document.querySelector('a-link[title="Voltar para a câmera"]');

    (target || backLink)?.emit('click', { source: 'gamepad' }, true);
}

function pollGamepads() {
    const currentPresses = new Set();

    for (const gamepad of navigator.getGamepads()) {
        if (!gamepad?.connected || !gamepad.buttons[0]?.pressed) {
            continue;
        }

        const gamepadKey = `${gamepad.index}:${gamepad.id}`;
        currentPresses.add(gamepadKey);

        if (!pressedGamepads.has(gamepadKey)) {
            console.log('Ação acionada pelo controle VR');
            activateCursorTarget();
        }
    }

    pressedGamepads.clear();
    currentPresses.forEach((gamepadKey) => pressedGamepads.add(gamepadKey));
    requestAnimationFrame(pollGamepads);
}

const scene = document.querySelector('a-scene');

if (scene.hasLoaded) {
    requestAnimationFrame(pollGamepads);
} else {
    scene.addEventListener('loaded', () => requestAnimationFrame(pollGamepads), { once: true });
}